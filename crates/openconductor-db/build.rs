fn main() {
    // Re-embed migrations when one is added or edited.
    println!("cargo:rerun-if-changed=migrations");
    println!("cargo:rerun-if-changed=cache/migrations");
}
