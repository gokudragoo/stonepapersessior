#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use stone_paper_scissors::{
    round_outcome, Choice, CrossChainMessage, Game, MatchStatus, Operation, PlayerInfo, RoundRecord, SpsAbi, InstantiationArgument, SpsParameters
};

use linera_sdk::{
    linera_base_types::{ChainId, WithContractAbi},
    views::{RootView, View},
    Contract, ContractRuntime,
};

use self::state::SpsState;

linera_sdk::contract!(SpsContract);

pub struct SpsContract {
    state: SpsState,
    runtime: ContractRuntime<Self>,
}

impl WithContractAbi for SpsContract {
    type Abi = SpsAbi;
}

impl SpsContract {
    fn is_host(&mut self, game: &Game) -> bool {
        game.host_chain_id == self.runtime.chain_id().to_string()
    }

    fn opponent_chain_id(&mut self, game: &Game) -> Option<ChainId> {
        let self_chain = self.runtime.chain_id().to_string();
        game.players
            .iter()
            .find(|p| p.chain_id != self_chain)
            .and_then(|p| p.chain_id.parse().ok())
    }

    fn reset_round_local_state(&mut self) {
        self.state.my_ready.set(false);
        self.state.opponent_ready.set(false);
        self.state.my_choice.set(None);
        self.state.opponent_choice.set(None);
    }

    fn can_play(&self, game: &Game) -> bool {
        game.status == MatchStatus::Active && game.players.len() == 2
    }

    fn host_and_guest_choices(
        &mut self,
        game: &Game,
        my_choice: Choice,
        opponent_choice: Choice,
    ) -> (Choice, Choice) {
        if self.is_host(game) {
            (my_choice, opponent_choice)
        } else {
            (opponent_choice, my_choice)
        }
    }
}

impl Contract for SpsContract {
    type Message = CrossChainMessage;
    type InstantiationArgument = InstantiationArgument;
    type Parameters = SpsParameters;
    type EventValue = ();

    async fn load(runtime: ContractRuntime<Self>) -> Self {
        let state = SpsState::load(runtime.root_view_storage_context())
            .await
            .expect("Failed to load state");
        SpsContract { state, runtime }
    }

    async fn instantiate(&mut self, _argument: InstantiationArgument) {
        self.state.game.set(None);
        self.reset_round_local_state();
        self.state.last_notification.set(None);
        self.state.matchmaking_queue.set(Vec::new());
    }

    async fn execute_operation(&mut self, operation: Operation) -> () {
        match operation {
            Operation::CreateMatch { host_name } => {
                let chain_id = self.runtime.chain_id().to_string();
                let match_id = self.runtime.system_time().micros().to_string();
                let game = Game {
                    match_id,
                    host_chain_id: chain_id.clone(),
                    status: MatchStatus::WaitingForPlayer,
                    players: vec![PlayerInfo {
                        chain_id,
                        name: host_name,
                    }],
                    round: 1,
                    host_score: 0,
                    guest_score: 0,
                    last_round: None,
                    last_host_choice: None,
                    last_guest_choice: None,
                    last_outcome: None,
                    history: Vec::new(),
                    winner_chain_id: None,
                };
                self.state.game.set(Some(game));
                self.reset_round_local_state();
                self.state.last_notification.set(None);
            }

            Operation::JoinMatch {
                host_chain_id,
                player_name,
            } => {
                let target_chain: ChainId = host_chain_id.parse().expect("Invalid host chain ID");
                let player_chain_id = self.runtime.chain_id();
                self.runtime.send_message(
                    target_chain,
                    CrossChainMessage::JoinRequest {
                        player_chain_id,
                        player_name,
                    },
                );
            }

            Operation::SearchPlayer {
                orchestrator_chain_id,
                player_name,
            } => {
                let orchestrator: ChainId =
                    orchestrator_chain_id.parse().expect("Invalid orchestrator chain ID");
                let player_chain_id = self.runtime.chain_id();
                self.state
                    .last_notification
                    .set(Some("Matchmaking search started".to_string()));
                self.runtime.send_message(
                    orchestrator,
                    CrossChainMessage::MatchmakingEnqueue {
                        player_chain_id,
                        player_name,
                    },
                );
            }

            Operation::PickAndReady { choice } => {
                let game = self.state.game.get().clone().expect("Match not found");
                if !self.can_play(&game) {
                    panic!("Match not ready");
                }
                if self.state.my_ready.get().clone() {
                    panic!("Already ready");
                }
                if self.state.my_choice.get().is_some() {
                    panic!("Choice already set");
                }

                self.state.my_choice.set(Some(choice));
                self.state.my_ready.set(true);

                let opponent = self.opponent_chain_id(&game).expect("Opponent not found");
                let round = game.round;
                let player_chain_id = self.runtime.chain_id();
                self.runtime.send_message(
                    opponent,
                    CrossChainMessage::ReadyNotice {
                        player_chain_id,
                        round,
                    },
                );

                if self.state.opponent_ready.get().clone() {
                    let player_chain_id = self.runtime.chain_id();
                    self.runtime.send_message(
                        opponent,
                        CrossChainMessage::ChoiceReveal {
                            player_chain_id,
                            round,
                            choice,
                        },
                    );
                }
            }

            Operation::LeaveMatch => {
                if let Some(game) = self.state.game.get().clone() {
                    if let Some(opponent) = self.opponent_chain_id(&game) {
                        let player_chain_id = self.runtime.chain_id();
                        self.runtime.send_message(
                            opponent,
                            CrossChainMessage::LeaveNotice {
                                player_chain_id,
                            },
                        );
                    }
                }
                self.state.game.set(None);
                self.reset_round_local_state();
                self.state.last_notification.set(None);
            }
        }
    }

    async fn execute_message(&mut self, message: Self::Message) {
        match message {
            CrossChainMessage::JoinRequest {
                player_chain_id,
                player_name,
            } => {
                let mut game = self.state.game.get().clone().expect("Match not found");
                if !self.is_host(&game) {
                    panic!("Only host can accept joins");
                }
                if game.status != MatchStatus::WaitingForPlayer {
                    panic!("Match not joinable");
                }
                if game.players.len() >= 2 {
                    panic!("Match full");
                }

                game.players.push(PlayerInfo {
                    chain_id: player_chain_id.to_string(),
                    name: player_name,
                });
                game.status = MatchStatus::Active;
                self.state.game.set(Some(game.clone()));
                self.reset_round_local_state();
                self.state.last_notification.set(Some("Player joined".to_string()));
                self.runtime.send_message(player_chain_id, CrossChainMessage::InitialStateSync { game });
            }

            CrossChainMessage::InitialStateSync { game } => {
                self.state.game.set(Some(game));
                self.reset_round_local_state();
                self.state.last_notification.set(Some("Match ready".to_string()));
            }

            CrossChainMessage::GameSync { game } => {
                self.state.game.set(Some(game));
                self.reset_round_local_state();
            }

            CrossChainMessage::ReadyNotice {
                player_chain_id: _,
                round,
            } => {
                let game = self.state.game.get().clone().expect("Match not found");
                if !self.can_play(&game) {
                    return;
                }
                if game.round != round {
                    return;
                }
                self.state.opponent_ready.set(true);

                if self.state.my_ready.get().clone() {
                    if let Some(choice) = self.state.my_choice.get().clone() {
                        if let Some(opponent) = self.opponent_chain_id(&game) {
                            let player_chain_id = self.runtime.chain_id();
                            self.runtime.send_message(
                                opponent,
                                CrossChainMessage::ChoiceReveal {
                                    player_chain_id,
                                    round,
                                    choice,
                                },
                            );
                        }
                    }
                }
            }

            CrossChainMessage::ChoiceReveal {
                player_chain_id: _,
                round,
                choice,
            } => {
                let mut game = self.state.game.get().clone().expect("Match not found");
                if !self.can_play(&game) {
                    return;
                }
                if game.round != round {
                    return;
                }
                if self.state.opponent_choice.get().is_some() {
                    return;
                }
                self.state.opponent_choice.set(Some(choice));

                if !self.is_host(&game) {
                    return;
                }
                let my_choice = match self.state.my_choice.get().clone() {
                    Some(c) => c,
                    None => return,
                };
                let opponent_choice = match self.state.opponent_choice.get().clone() {
                    Some(c) => c,
                    None => return,
                };

                let (host_choice, guest_choice) =
                    self.host_and_guest_choices(&game, my_choice, opponent_choice);

                let outcome = round_outcome(host_choice, guest_choice);

                game.last_round = Some(game.round);
                game.last_host_choice = Some(host_choice);
                game.last_guest_choice = Some(guest_choice);
                game.last_outcome = Some(outcome);

                match outcome {
                    stone_paper_scissors::RoundOutcome::HostWins => game.host_score = game.host_score.saturating_add(1),
                    stone_paper_scissors::RoundOutcome::GuestWins => game.guest_score = game.guest_score.saturating_add(1),
                    stone_paper_scissors::RoundOutcome::Draw => {}
                }

                game.history.push(RoundRecord {
                    round,
                    host_choice,
                    guest_choice,
                    outcome,
                    host_score: game.host_score,
                    guest_score: game.guest_score,
                    timestamp: self.runtime.system_time().micros().to_string(),
                });
                if game.history.len() > 50 {
                    let excess = game.history.len() - 50;
                    game.history.drain(0..excess);
                }

                if game.host_score >= 3 || game.guest_score >= 3 {
                    game.status = MatchStatus::Ended;
                    let winner_chain_id = if game.host_score >= 3 {
                        game.host_chain_id.clone()
                    } else {
                        game.players
                            .iter()
                            .find(|p| p.chain_id != game.host_chain_id)
                            .map(|p| p.chain_id.clone())
                            .unwrap_or_default()
                    };
                    game.winner_chain_id = Some(winner_chain_id);
                } else {
                    game.round = game.round.saturating_add(1);
                }

                self.state.game.set(Some(game.clone()));
                self.reset_round_local_state();

                if let Some(opponent) = self.opponent_chain_id(&game) {
                    self.runtime.send_message(opponent, CrossChainMessage::GameSync { game });
                }
            }

            CrossChainMessage::LeaveNotice { player_chain_id: _ } => {
                self.state.game.set(None);
                self.reset_round_local_state();
                self.state.last_notification.set(Some("Opponent left".to_string()));
            }

            CrossChainMessage::MatchmakingEnqueue {
                player_chain_id,
                player_name,
            } => {
                let mut queue = self.state.matchmaking_queue.get().clone();
                let now_micros: u64 = self.runtime.system_time().micros();
                let cutoff_micros: u64 = now_micros.saturating_sub(5 * 60 * 1_000_000);
                queue.retain(|p| p.enqueued_at_micros >= cutoff_micros);

                let player_chain_str = player_chain_id.to_string();
                if let Some(existing) = queue.iter_mut().find(|p| p.chain_id == player_chain_str) {
                    existing.player_name = player_name.clone();
                    existing.enqueued_at_micros = now_micros;
                } else {
                    queue.push(stone_paper_scissors::MatchmakingPlayer {
                        chain_id: player_chain_str,
                        player_name: player_name.clone(),
                        enqueued_at_micros: now_micros,
                    });
                }
                self.state.matchmaking_queue.set(queue.clone());

                let orchestrator_chain_id = self.runtime.chain_id();
                self.runtime.send_message(
                    player_chain_id,
                    CrossChainMessage::MatchmakingEnqueued {
                        orchestrator_chain_id,
                    },
                );

                if queue.len() < 2 {
                    return;
                }

                let host = queue.remove(0);
                let guest = queue.remove(0);
                self.state.matchmaking_queue.set(queue);

                let host_chain_id: ChainId = host.chain_id.parse().expect("Invalid host chain ID");
                let guest_chain_id: ChainId =
                    guest.chain_id.parse().expect("Invalid guest chain ID");
                self.runtime.send_message(
                    host_chain_id,
                    CrossChainMessage::MatchmakingStart {
                        host_name: host.player_name,
                        guest_chain_id,
                        guest_name: guest.player_name,
                    },
                );
                self.runtime.send_message(
                    guest_chain_id,
                    CrossChainMessage::MatchmakingFound { host_chain_id },
                );
            }

            CrossChainMessage::MatchmakingEnqueued {
                orchestrator_chain_id,
            } => {
                self.state.last_notification.set(Some(format!(
                    "Enqueued on {}",
                    orchestrator_chain_id
                )));
            }

            CrossChainMessage::MatchmakingStart {
                host_name,
                guest_chain_id,
                guest_name,
            } => {
                if let Some(game) = self.state.game.get().clone() {
                    if game.status == MatchStatus::Active {
                        return;
                    }
                }

                let chain_id = self.runtime.chain_id().to_string();
                let match_id = self.runtime.system_time().micros().to_string();
                let game = Game {
                    match_id,
                    host_chain_id: chain_id.clone(),
                    status: MatchStatus::Active,
                    players: vec![
                        PlayerInfo {
                            chain_id: chain_id.clone(),
                            name: host_name,
                        },
                        PlayerInfo {
                            chain_id: guest_chain_id.to_string(),
                            name: guest_name,
                        },
                    ],
                    round: 1,
                    host_score: 0,
                    guest_score: 0,
                    last_round: None,
                    last_host_choice: None,
                    last_guest_choice: None,
                    last_outcome: None,
                    history: Vec::new(),
                    winner_chain_id: None,
                };

                self.state.game.set(Some(game.clone()));
                self.reset_round_local_state();
                self.state
                    .last_notification
                    .set(Some("Match found (host)".to_string()));
                self.runtime
                    .send_message(guest_chain_id, CrossChainMessage::InitialStateSync { game });
            }

            CrossChainMessage::MatchmakingFound { host_chain_id } => {
                self.state.last_notification.set(Some(format!(
                    "Match found. Host: {}",
                    host_chain_id
                )));
            }
        }
    }

    async fn process_streams(
        &mut self,
        _streams: Vec<linera_sdk::linera_base_types::StreamUpdate>,
    ) {
    }

    async fn store(mut self) {
        let _ = self.state.save().await;
    }
}
