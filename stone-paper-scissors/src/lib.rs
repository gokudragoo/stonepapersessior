use async_graphql::{Request, Response};
use linera_sdk::linera_base_types::{ChainId, ContractAbi, ServiceAbi};
use serde::{Deserialize, Serialize};

pub struct SpsAbi;

impl ContractAbi for SpsAbi {
    type Operation = Operation;
    type Response = ();
}

impl ServiceAbi for SpsAbi {
    type Query = Request;
    type QueryResponse = Response;
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct SpsParameters;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct InstantiationArgument;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, async_graphql::Enum)]
pub enum MatchStatus {
    WaitingForPlayer,
    Active,
    Ended,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, async_graphql::Enum)]
pub enum Choice {
    Stone,
    Paper,
    Scissors,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, async_graphql::Enum)]
pub enum RoundOutcome {
    Draw,
    HostWins,
    GuestWins,
}

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct RoundRecord {
    pub round: u8,
    pub host_choice: Choice,
    pub guest_choice: Choice,
    pub outcome: RoundOutcome,
    pub host_score: u8,
    pub guest_score: u8,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct PlayerInfo {
    pub chain_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct Game {
    pub match_id: String,
    pub host_chain_id: String,
    pub status: MatchStatus,
    pub players: Vec<PlayerInfo>,
    pub round: u8,
    pub host_score: u8,
    pub guest_score: u8,
    pub last_round: Option<u8>,
    pub last_host_choice: Option<Choice>,
    pub last_guest_choice: Option<Choice>,
    pub last_outcome: Option<RoundOutcome>,
    pub history: Vec<RoundRecord>,
    pub winner_chain_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum Operation {
    CreateMatch { host_name: String },
    JoinMatch { host_chain_id: String, player_name: String },
    SearchPlayer {
        orchestrator_chain_id: String,
        player_name: String,
    },
    PickAndReady { choice: Choice },
    LeaveMatch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchmakingPlayer {
    pub chain_id: String,
    pub player_name: String,
    #[serde(default)]
    pub enqueued_at_micros: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CrossChainMessage {
    JoinRequest { player_chain_id: ChainId, player_name: String },
    InitialStateSync { game: Game },
    GameSync { game: Game },
    ReadyNotice { player_chain_id: ChainId, round: u8 },
    ChoiceReveal {
        player_chain_id: ChainId,
        round: u8,
        choice: Choice,
    },
    LeaveNotice { player_chain_id: ChainId },
    MatchmakingEnqueue {
        player_chain_id: ChainId,
        player_name: String,
    },
    MatchmakingEnqueued {
        orchestrator_chain_id: ChainId,
    },
    MatchmakingStart {
        host_name: String,
        guest_chain_id: ChainId,
        guest_name: String,
    },
    MatchmakingFound {
        host_chain_id: ChainId,
    },
}

pub fn round_outcome(host_choice: Choice, guest_choice: Choice) -> RoundOutcome {
    use Choice::*;
    match (host_choice, guest_choice) {
        (a, b) if a == b => RoundOutcome::Draw,
        (Stone, Scissors) | (Paper, Stone) | (Scissors, Paper) => RoundOutcome::HostWins,
        _ => RoundOutcome::GuestWins,
    }
}
