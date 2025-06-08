final: prev: let
  version = "v1.0.0-beta.3";
  
  # Define the binary URLs and their hashes (these would need to be updated for each version)
  # Use nix-prefetch-url to get the SHA256 hash for each URL
  sources = {
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
  
  # Get the source for the current system
  currentSystem = prev.stdenv.hostPlatform.system;
  source = sources.${currentSystem} or (throw "Unsupported system: ${currentSystem}");
  
in {
  # Create the noir package
  noir = prev.stdenv.mkDerivation {
    pname = "noir-toolchain";
    inherit version;
    
    src = prev.fetchurl {
      url = source.url;
      sha256 = source.sha256;
    };
    
    # Need gnutar and gzip for extraction
    nativeBuildInputs = with prev; [ gnutar gzip ];
    
    # Skip the unpack phase - we'll extract manually in installPhase
    dontUnpack = true;
    
    # Extract and install binaries directly from the tarball
    installPhase = ''
      mkdir -p $out/bin
      tar -xzf $src -C $out/bin
      chmod +x $out/bin/nargo
      chmod +x $out/bin/noir-inspector
      chmod +x $out/bin/noir-profiler
    '';
    
    meta = {
      description = "Noir language toolchain (v1.0.0-beta.3)";
      homepage = "https://noir-lang.org/";
      platforms = prev.lib.platforms.unix;
    };
  };
}
