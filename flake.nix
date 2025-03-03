{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = inputs@{ self, nixpkgs, ... }:
    let
      system =  "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
  rec {
    nixosModules.default = (import ./config.nix) self;
    nixosModules.fix-efi-bootorder = nixosModules.default;

    packages.${system} = let
      pkg_deps = with pkgs; [ bash efibootmgr gawk gnugrep util-linux ];
      path = pkgs.lib.makeBinPath pkg_deps;
    in rec {
      fix-efi-bootorder = pkgs.buildNpmPackage rec {
        name = "fix-efi-bootorder";
        src = ./src;
        npmDepsHash = "sha256-MCxr/A3HB/BbPz0JST6rFfMBh1TgDbKkKC3LN/Z7b7A=";
        dontNpmBuild = true;
        makeCacheWritable = true;
        nativeBuildInputs = with pkgs; [
          makeWrapper
        ];
        postInstall = ''
          wrapProgram $out/bin/${name} \
          --set PATH "${path}" 
        '';
      };
    };

    devShells.${system}.default = pkgs.mkShell {
      buildInputs = with pkgs; [
        nodejs
        python3
      ];
    };
  };
}
