#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use std::sync::Arc;

use async_graphql::{EmptySubscription, Object, Request, Response, Schema};
use linera_sdk::{linera_base_types::WithServiceAbi, views::View, Service, ServiceRuntime};
use stone_paper_scissors::{Choice, Game, MatchStatus, Operation, RoundRecord, SpsAbi, RoundOutcome, SpsParameters};

use self::state::SpsState;

linera_sdk::service!(SpsService);

pub struct SpsService {
    state: SpsState,
    runtime: Arc<ServiceRuntime<Self>>,
}

impl WithServiceAbi for SpsService {
    type Abi = SpsAbi;
}

impl Service for SpsService {
    type Parameters = SpsParameters;

    async fn new(runtime: ServiceRuntime<Self>) -> Self {
        let state = SpsState::load(runtime.root_view_storage_context())
            .await
            .expect("Failed to load state");
        SpsService {
            state,
            runtime: Arc::new(runtime),
        }
    }

    async fn handle_query(&self, request: Request) -> Response {
        let game = self.state.game.get().clone();
        let my_ready = self.state.my_ready.get().clone();
        let opponent_ready = self.state.opponent_ready.get().clone();
        let my_choice = self.state.my_choice.get().clone();
        let opponent_choice = self.state.opponent_choice.get().clone();
        let last_notification = self.state.last_notification.get().clone();
        let schema = Schema::build(
            QueryRoot {
                game,
                chain_id: self.runtime.chain_id().to_string(),
                my_ready,
                opponent_ready,
                my_choice,
                opponent_choice,
                last_notification,
            },
            MutationRoot {
                runtime: self.runtime.clone(),
            },
            EmptySubscription,
        )
        .finish();
        schema.execute(request).await
    }
}

struct QueryRoot {
    game: Option<Game>,
    chain_id: String,
    my_ready: bool,
    opponent_ready: bool,
    my_choice: Option<Choice>,
    opponent_choice: Option<Choice>,
    last_notification: Option<String>,
}

#[Object]
impl QueryRoot {
    async fn game(&self) -> Option<&Game> {
        self.game.as_ref()
    }

    async fn match_status(&self) -> Option<MatchStatus> {
        self.game.as_ref().map(|g| g.status)
    }

    async fn round(&self) -> Option<i32> {
        self.game.as_ref().map(|g| g.round as i32)
    }

    async fn is_host(&self) -> bool {
        self.game
            .as_ref()
            .map(|g| g.host_chain_id == self.chain_id)
            .unwrap_or(false)
    }

    async fn opponent_chain_id(&self) -> Option<String> {
        let game = self.game.as_ref()?;
        game.players
            .iter()
            .find(|p| p.chain_id != self.chain_id)
            .map(|p| p.chain_id.clone())
    }

    async fn my_ready(&self) -> bool {
        self.my_ready
    }

    async fn opponent_ready(&self) -> bool {
        self.opponent_ready
    }

    async fn my_choice(&self) -> Option<Choice> {
        self.my_choice
    }

    async fn opponent_choice(&self) -> Option<Choice> {
        self.opponent_choice
    }

    async fn my_score(&self) -> Option<i32> {
        let game = self.game.as_ref()?;
        if game.host_chain_id == self.chain_id {
            Some(game.host_score as i32)
        } else {
            Some(game.guest_score as i32)
        }
    }

    async fn opponent_score(&self) -> Option<i32> {
        let game = self.game.as_ref()?;
        if game.host_chain_id == self.chain_id {
            Some(game.guest_score as i32)
        } else {
            Some(game.host_score as i32)
        }
    }

    async fn last_outcome(&self) -> Option<RoundOutcome> {
        self.game.as_ref().and_then(|g| g.last_outcome)
    }

    async fn round_history(&self) -> Vec<RoundRecord> {
        self.game
            .as_ref()
            .map(|g| g.history.clone())
            .unwrap_or_default()
    }

    async fn last_round_record(&self) -> Option<RoundRecord> {
        self.game
            .as_ref()
            .and_then(|g| g.history.last().cloned())
    }

    async fn last_notification(&self) -> Option<String> {
        self.last_notification.clone()
    }
}

struct MutationRoot {
    runtime: Arc<ServiceRuntime<SpsService>>,
}

#[Object]
impl MutationRoot {
    async fn create_match(&self, host_name: String) -> String {
        self.runtime
            .schedule_operation(&Operation::CreateMatch { host_name: host_name.clone() });
        format!("Match created by '{}'", host_name)
    }

    async fn join_match(&self, host_chain_id: String, player_name: String) -> String {
        self.runtime.schedule_operation(&Operation::JoinMatch {
            host_chain_id: host_chain_id.clone(),
            player_name: player_name.clone(),
        });
        format!("Join request sent to {}", host_chain_id)
    }

    async fn search_player(&self, orchestrator_chain_id: String, player_name: String) -> String {
        self.runtime.schedule_operation(&Operation::SearchPlayer {
            orchestrator_chain_id: orchestrator_chain_id.clone(),
            player_name,
        });
        format!("Search requested via {}", orchestrator_chain_id)
    }

    async fn pick_and_ready(&self, choice: Choice) -> String {
        self.runtime
            .schedule_operation(&Operation::PickAndReady { choice });
        "Ready sent".to_string()
    }

    async fn leave_match(&self) -> String {
        self.runtime.schedule_operation(&Operation::LeaveMatch);
        "Leave requested".to_string()
    }
}
