use linera_sdk::views::{linera_views, RegisterView, RootView, ViewStorageContext};
use stone_paper_scissors::{Choice, Game, MatchmakingPlayer};

#[derive(RootView)]
#[view(context = ViewStorageContext)]
pub struct SpsState {
    pub game: RegisterView<Option<Game>>,
    pub my_ready: RegisterView<bool>,
    pub opponent_ready: RegisterView<bool>,
    pub my_choice: RegisterView<Option<Choice>>,
    pub opponent_choice: RegisterView<Option<Choice>>,
    pub last_notification: RegisterView<Option<String>>,
    pub matchmaking_queue: RegisterView<Vec<MatchmakingPlayer>>,
}
