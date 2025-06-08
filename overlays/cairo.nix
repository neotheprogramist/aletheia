# Cairo Nix Overlay
# This overlay creates a unified 'cairo' package containing all the tools
# from the cairo-install.sh script.

final: prev:

let
  # Helper function to create a Rust package using fetchFromGitHub
  mkRustPackage = { name, repo, owner, tag, sha256, cargoHash, buildAndInstallSubdir ? "", extraRustcOpts ? [], nativeBuildInputs ? [], doCheck ? true }: 
    prev.rustPlatform.buildRustPackage {
      pname = name;
      version = tag;
      
      src = prev.fetchFromGitHub {
        inherit owner repo tag;
        sha256 = sha256;
      };
      
      inherit cargoHash doCheck;
      
      sourceRoot = if buildAndInstallSubdir != "" then "${repo}-${tag}/${buildAndInstallSubdir}" else null;
      
      buildPhase = if buildAndInstallSubdir != "" then ''
        cargo build --release
      '' else null;
      
      installPhase = if buildAndInstallSubdir != "" then ''
        mkdir -p $out/bin
        cp target/release/${name} $out/bin/
      '' else null;
      
      nativeBuildInputs = nativeBuildInputs;
      
      RUSTFLAGS = prev.lib.concatStringsSep " " extraRustcOpts;
      
      meta = {
        description = "${name} for Cairo development";
        homepage = "https://github.com/${owner}/${repo}";
      };
    };
  
  # Define the individual packages
  scarb = mkRustPackage {
    name = "scarb";
    repo = "scarb";
    owner = "software-mansion";
    tag = "v2.11.4";
    sha256 = "sha256-Xq5tIGJV9gBKhBZ0ggCdGOYGc5/3MaEUQL+ToLJdGC4=";
    cargoHash = "sha256-3Eu3FnuGhqZHl2hgSXc2kmp08y/T9x0N8lLD0DULQ6w=";
  };
  
  # The following packages use placeholder cargoHash values.
  # To get the actual values, replace lib.fakeSha256 with these placeholders
  # and run 'nix-build -A <package-name>' for each package.
  # The error message will show the actual hash to use.
  
  cairo-coverage = mkRustPackage {
    name = "cairo-coverage";
    repo = "cairo-coverage";
    owner = "software-mansion";
    tag = "v0.5.0";
    sha256 = "sha256-m9wOrv2BjokLmFOfT1jGpYG2Q0BAd2DfhpGgFYXZNSo=";
    cargoHash = "sha256-fh19xpifd40qe+v3Epv5yfFHuqmCbo/gDQWqzoGAxss=";
    doCheck = false; # Disable tests that require external Cairo toolchain
  };
  
  cairo-profiler = mkRustPackage {
    name = "cairo-profiler";
    repo = "cairo-profiler";
    owner = "software-mansion";
    tag = "v0.9.0";
    sha256 = "sha256-z75kV1ZUi+JqIeo6zxojeTlSQwgGIIh10wXaNY3+5Pc=";
    cargoHash = "sha256-Cf89HPT0XeJFOVZn5DrSy3n8JmYWdhtr4OX3c2dNvMk=";
    nativeBuildInputs = with prev; [ protobuf ];
  };
  
  universal-sierra-compiler = mkRustPackage {
    name = "universal-sierra-compiler";
    repo = "universal-sierra-compiler";
    owner = "software-mansion";
    tag = "v2.5.0";
    sha256 = "sha256-tbla9kcQ2HYYLKGr/b20m+bGX0KZvYkqJgk5Ws7sdx4=";
    cargoHash = "sha256-7ndP2cty0PIclcOYxL/ujo5feu3QBuQMH76HVjNTP4U=";
  };
  
  # Starknet Foundry packages
  forge = mkRustPackage {
    name = "snforge";
    repo = "starknet-foundry";
    owner = "foundry-rs";
    tag = "v0.44.0";
    sha256 = "sha256-6ZU83eWs7ERQ2SMEis53vBgbshP8K0Me45x/waALBKo=";
    cargoHash = "sha256-6ZU83eWs7ERQ2SMEis53vBgbshP8K0Me45x/waALBKo=";
    buildAndInstallSubdir = "crates/forge";
  };
  
  sncast = mkRustPackage {
    name = "sncast";
    repo = "starknet-foundry";
    owner = "foundry-rs";
    tag = "v0.44.0";
    sha256 = "sha256-6ZU83eWs7ERQ2SMEis53vBgbshP8K0Me45x/waALBKo=";
    cargoHash = "sha256-6ZU83eWs7ERQ2SMEis53vBgbshP8K0Me45x/waALBKo=";
    buildAndInstallSubdir = "crates/sncast";
  };
  
in {
  # Create the combined cairo package with all binaries
  cairo = prev.symlinkJoin {
    name = "cairo-tools";
    paths = [
      # Temporarily disable scarb due to workspace dependency issues in Nix
      # scarb
      cairo-coverage
      cairo-profiler
      universal-sierra-compiler
      # Temporarily disable forge and sncast until we get their cargo hashes
      # forge
      # sncast
    ];
    
    meta = {
      description = "Collection of Cairo development tools";
      maintainers = [];
      platforms = prev.lib.platforms.all;
    };
  };
  
  # Also export individual packages
  inherit cairo-coverage cairo-profiler universal-sierra-compiler; # scarb forge sncast;
}
