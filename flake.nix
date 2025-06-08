{
  description = "Example Rust development environment for Zero to Nix";

  # Flake inputs
  inputs = {
    # Latest stable Nixpkgs
    nixpkgs.url = "https://flakehub.com/f/NixOS/nixpkgs/*";
  };

  # Flake outputs
  outputs = { self, nixpkgs }:
    let
      # Overlays enable you to customize the Nixpkgs attribute set
      overlays = [
        # Import the noir overlay
        (import ./overlays/noir.nix)
        # Import the cairo overlay
        (import ./overlays/cairo.nix)
      ];

      # Systems supported
      allSystems = [
        "x86_64-linux" # 64-bit Intel/AMD Linux
        "aarch64-linux" # 64-bit ARM Linux
        "x86_64-darwin" # 64-bit Intel macOS
        "aarch64-darwin" # 64-bit ARM macOS
      ];

      # Helper to provide system-specific attributes
      forAllSystems = f: nixpkgs.lib.genAttrs allSystems (system: f {
        pkgs = import nixpkgs { inherit overlays system; };
      });
    in
    {
      # Development environment output
      devShells = forAllSystems ({ pkgs }: {
        default = pkgs.mkShell {
          # The Nix packages provided in the environment
          packages = (with pkgs; [
            # Add noir
            noir
            # Add cairo
            cairo
          ]) ++ pkgs.lib.optionals pkgs.stdenv.isDarwin (with pkgs; [ libiconv ]);
        };
      });
    };
}
