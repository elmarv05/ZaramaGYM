fn main() {
    tauri_build::build();

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();

    if target_os == "windows" && target_env == "gnu" {
        let out_dir = std::env::var("OUT_DIR").unwrap();
        let manifest_path = std::path::Path::new(&out_dir).join("app_manifest.xml");
        let rc_path = std::path::Path::new(&out_dir).join("app_manifest.rc");
        let res_path = std::path::Path::new(&out_dir).join("app_manifest.o");

        let xml_content = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
</assembly>
"#;
        let _ = std::fs::write(&manifest_path, xml_content);
        let escaped_path = manifest_path.to_string_lossy().replace('\\', "/");
        let _ = std::fs::write(&rc_path, format!("1 24 \"{}\"", escaped_path));

        let status = std::process::Command::new("windres")
            .arg("-i")
            .arg(&rc_path)
            .arg("-o")
            .arg(&res_path)
            .status();

        if let Ok(s) = status {
            if s.success() {
                println!("cargo:rustc-link-arg={}", res_path.to_string_lossy());
            }
        }
    }
}
