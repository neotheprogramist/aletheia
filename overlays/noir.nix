# Noir Nix Overlay
# This overlay creates a 'noir' package containing all the Noir toolchain tools
# by downloading pre-built binaries from GitHub releases.

final: prev:

let
  version = "v1.0.0-beta.3";
  
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
        tar -xzf $src -C $out/bin
        chmod +x $out/bin/*
      '';
      
      meta = with prev.lib; {
        description = "${name} for Noir development";
        homepage = "https://github.com/${owner}/${repo}";
        license = licenses.mit;
        platforms = prev.lib.platforms.unix;
        maintainers = [ ];
      };
    };

in {
  # Create the noir package
  noir = mkBinaryPackage {
    name = "noir-toolchain";
    inherit version;
    repo = "noir";
    owner = "noir-lang";
    platforms = {
      x86_64-linux = {
        url = "https://github.com/noir-lang/noir/releases/download/${version}/noir-x86_64-unknown-linux-gnu.tar.gz";
        sha256 = "1q2nk9953ar4pfs9b5anf4q2hagffvwqc910vvbz2qdc2c487n1y";
      };
      aarch64-linux = {
        url = "https://github.com/noir-lang/noir/releases/download/${version}/noir-aarch64-unknown-linux-gnu.tar.gz";
        sha256 = "17x2mlaf5fa5hrqpvjvjqn81d905y1fsfd8pg0ji0nxs5ya2m09g";
      };
      x86_64-darwin = {
        url = "https://github.com/noir-lang/noir/releases/download/${version}/noir-x86_64-apple-darwin.tar.gz";
        sha256 = "13yr9hvmh269nvn4csbgwshagkirwhd4ilvyar6lcv051l5ks0jk";
      };
      aarch64-darwin = {
        url = "https://github.com/noir-lang/noir/releases/download/${version}/noir-aarch64-apple-darwin.tar.gz";
        sha256 = "1sdpam42hrc6dzmfmy41hgpdbi7bbz03cmq0pws50xg2zr0bkgvb";
      };
    };
  };
}
