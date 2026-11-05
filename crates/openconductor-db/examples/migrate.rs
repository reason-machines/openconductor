//! Create a migrated database file: `cargo run --example migrate -- <path>`.
#[tokio::main]
async fn main() {
    let path = std::env::args().nth(1).expect("usage: migrate <path>");
    openconductor_db::open(&path).await.expect("migrate");
}
