self: { pkgs, config }: let
  system = "x86_64-linux";
  bootloader = if config.boot.loader.systemd-boot.enable then
    "systemd-boot"
  else if config.boot.loader.grub.enable then
    "grub"
  else
    throw "Neither systemd-boot nor grub is enabled in the configuration.";
in {
  encironment.systemPackages = [
    pkgs.writeScriptBin "fix-bootorder" ''
      #!${pkgs.stdenv.shell}
      set -euxo pipefail
      ${self.packages.${system}.default}/bin/fix-efi-bootorder --bootloader ${bootloader} --first PXE"
    ''
  ];
}
