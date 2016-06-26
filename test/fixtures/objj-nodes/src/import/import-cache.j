@import "foo.j"

// If imports were not cached, the second import would re-parse foo.j
// and generate a warning about a duplicate @global declaration.

@import "foo.j"
