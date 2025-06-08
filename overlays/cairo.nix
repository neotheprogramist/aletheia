# Cairo Nix Overlay
# This overlay creates a unified 'cairo' package containing all the tools
# by downloading pre-built binaries from GitHub releases and building some from source.

final: prev:

let
  # Define versions for each tool
  scarbVersion = "v2.11.4";
  foundryVersion = "v0.44.0";
  
  # Helper function to create a Rust package using fetchFromGitHub
  mkRustPackage = { name, repo, owner, tag, sha256, cargoHash, nativeBuildInputs ? [ ], doCheck ? true }: 
    prev.rustPlatform.buildRustPackage {
      pname = name;
      version = tag;
      
      src = prev.fetchFromGitHub {
        inherit owner repo sha256;
        rev = tag;
      };
      
      inherit cargoHash doCheck nativeBuildInputs;
      
      meta = with prev.lib; {
        description = "${name} for Cairo development";
        homepage = "https://github.com/${owner}/${repo}";
        license = licenses.mit; # Most Cairo tools use MIT
        platforms = prev.lib.platforms.unix;
        maintainers = [ ];
      };
    };
  
  # Helper function to create a package from GitHub release binaries
  mkBinaryPackage = { name, version, repo, owner, platforms }:
    let
      # Get the source for the current system
      currentSystem = prev.stdenv.hostPlatform.system;
      source = platforms.${currentSystem} or (throw "Unsupported system: ${currentSystem} for ${name}");
    in
    prev.stdenv.mkDerivation {
      pname = name;
      inherit version;
      
      src = prev.fetchurl {
        url = source.url;
        sha256 = source.sha256;
      };
      
      nativeBuildInputs = with prev; [ gnutar gzip ];
      
      # Skip the unpack phase - extract manually in installPhase
      dontUnpack = true;
      
      # Extract and install binaries directly from the tarball
      installPhase = ''
        mkdir -p $out/bin
        tar -xzf $src -C $out/bin --strip-components=2
        chmod +x $out/bin/*
      '';
      
      meta = with prev.lib; {
        description = "${name} for Cairo development";
        homepage = "https://github.com/${owner}/${repo}";
        license = licenses.mit; # Most Cairo tools use MIT
        platforms = prev.lib.platforms.unix;
        maintainers = [ ];
      };
    };
  
  # Scarb package
  scarb = mkBinaryPackage {
    name = "scarb";
    version = scarbVersion;
    repo = "scarb";
    owner = "software-mansion";
    platforms = {
      x86_64-linux = {
        url = "https://github.com/software-mansion/scarb/releases/download/${scarbVersion}/scarb-${scarbVersion}-x86_64-unknown-linux-gnu.tar.gz";
        sha256 = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; # Update with real hash
      };
      aarch64-linux = {
        url = "https://github.com/software-mansion/scarb/releases/download/${scarbVersion}/scarb-${scarbVersion}-aarch64-unknown-linux-gnu.tar.gz";
        sha256 = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; # Update with real hash
      };
      x86_64-darwin = {
        url = "https://github.com/software-mansion/scarb/releases/download/${scarbVersion}/scarb-${scarbVersion}-x86_64-apple-darwin.tar.gz";
        sha256 = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; # Update with real hash
      };
      aarch64-darwin = {
        url = "https://github.com/software-mansion/scarb/releases/download/${scarbVersion}/scarb-${scarbVersion}-aarch64-apple-darwin.tar.gz";
        sha256 = "sha256-yEoh/HU5edzo8BJz8SGPwU9F0ebCyHn0wKRrLBvD2d4=";
      };
    };
  };
  
  # Starknet Foundry package (contains snforge and sncast)
  starknet-foundry = mkBinaryPackage {
    name = "starknet-foundry";
    version = foundryVersion;
    repo = "starknet-foundry";
    owner = "foundry-rs";
    platforms = {
      x86_64-linux = {
        url = "https://github.com/foundry-rs/starknet-foundry/releases/download/${foundryVersion}/starknet-foundry-${foundryVersion}-x86_64-unknown-linux-gnu.tar.gz";
        sha256 = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; # Update with real hash
      };
      aarch64-linux = {
        url = "https://github.com/foundry-rs/starknet-foundry/releases/download/${foundryVersion}/starknet-foundry-${foundryVersion}-aarch64-unknown-linux-gnu.tar.gz";
        sha256 = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; # Update with real hash
      };
      x86_64-darwin = {
        url = "https://github.com/foundry-rs/starknet-foundry/releases/download/${foundryVersion}/starknet-foundry-${foundryVersion}-x86_64-apple-darwin.tar.gz";
        sha256 = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; # Update with real hash
      };
      aarch64-darwin = {
        url = "https://github.com/foundry-rs/starknet-foundry/releases/download/${foundryVersion}/starknet-foundry-${foundryVersion}-aarch64-apple-darwin.tar.gz";
        sha256 = "sha256-YDGoSgcqYwY+gSKKwU5f44UBRSqzltAgHC/CIoZb1OY=";
      };
    };
  };
  
  # Source-built packages (no pre-built binaries available)
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

in {
  # Create the combined cairo package with all binaries
  cairo = prev.symlinkJoin {
    name = "cairo-tools";
    paths = [
      scarb
      starknet-foundry
      cairo-coverage
      cairo-profiler
      universal-sierra-compiler
    ];
    
    meta = with prev.lib; {
      description = "Collection of Cairo development tools (pre-built binaries and source builds)";
      homepage = "https://www.cairo-lang.org/";
      license = licenses.mit;
      platforms = prev.lib.platforms.unix;
      maintainers = [ ];
    };
  };
  
  # Also export individual packages
  inherit scarb starknet-foundry cairo-coverage cairo-profiler universal-sierra-compiler;
}
