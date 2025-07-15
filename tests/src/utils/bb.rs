// setup devnet, deploy Aletheia

use starknet_rs_core::types::Felt;
use std::env;
use std::error::Error;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use tokio::fs;

pub async fn load_vk_from_file(path: &str) -> Vec<Felt> {
    let data = fs::read_to_string(path).await.unwrap();
    let hex_vec: Vec<String> = serde_json::from_str(&data).unwrap();
    hex_vec
        .into_iter()
        .map(|e| Felt::from_hex(&e).expect("Invalid hex in VK"))
        .collect()
}

fn get_nargo_path() -> Result<PathBuf, Box<dyn Error>> {
    // Build path: $HOME/.nargo/bin/nargo
    let home = env::var_os("HOME").ok_or("Home env var not set").unwrap();
    Ok(PathBuf::from(home).join(".nargo").join("bin").join("nargo"))
}

pub fn run_nargo_build() -> Result<String, Box<dyn Error>> {
    let nargo_path = get_nargo_path()?;
    let output = Command::new(&nargo_path)
        .arg("build")
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .output()?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
        Ok(stdout)
    } else {
        Err(format!("`nargo build` failed with exit code: {}", output.status).into())
    }
}

pub fn get_current_dir() -> Result<PathBuf, Box<dyn Error>> {
    std::env::current_dir().map_err(|e| e.into())
}

pub fn run_nargo_witness(circuit: &str) -> Result<(), Box<dyn Error>> {
    let nargo = get_nargo_path()?;

    let circuit_dir = format!("../frontend/static/circuits/{}", circuit);
    let output = Command::new(&nargo)
        .current_dir(&circuit_dir)
        .arg("execute")
        .arg("witness")
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .output()?;

    if !output.status.success() {
        return Err(format!(
            "`nargo execute witness` for `{}` failed with code {}",
            circuit, output.status
        )
        .into());
    }

    let output_mv = Command::new("mv")
        .current_dir("../target/")
        .arg("witness.gz")
        .arg(format!("{}/", circuit))
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .output()?;

    if !output_mv.status.success() {
        return Err(format!(
            "`mv witness.gz` for `{}` failed with code {}",
            circuit, output_mv.status
        )
        .into());
    }

    Ok(())
}

fn get_bb_path() -> Result<PathBuf, Box<dyn Error>> {
    // Build path: $HOME/.bb/bb
    let home = env::var_os("HOME").ok_or("HOME environment variable not set")?;
    Ok(PathBuf::from(home).join(".bb").join("bb"))
}

pub async fn run_bb_write_vks(is_keccak: bool) -> Result<(Vec<Felt>, Vec<Felt>), Box<dyn Error>> {
    let bb_path: PathBuf = get_bb_path()?;

    // VK names to process
    let vks = ["merge", "transfer", "execute", "recursive"];
    let mut concat_vks: Vec<Felt> = Vec::new();

    for vk in &vks {
        let input = format!("../target/{}.json", vk);
        let output_dir = format!("../target/{}", vk);

        let mut cmd = Command::new(&bb_path);
        cmd.arg("write_vk").arg("--scheme").arg("ultra_honk");

        if is_keccak || *vk == "recursive" {
            cmd.arg("--oracle_hash").arg("keccak");
        }

        cmd.arg("-b")
            .arg(&input)
            .arg("-o")
            .arg(&output_dir)
            .arg("--output_format")
            .arg("bytes_and_fields")
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());

        let status = cmd.status()?;

        if !status.success() {
            return Err(format!("`bb write_vk` for {} failed: {}", vk, status).into());
        }

        println!("VK `{}` saved in `{}`", vk, output_dir);

        if *vk == "recursive" {
            continue;
        }

        // Load fields and append to the concatenated vector
        let mut vk_fields = load_vk_from_file(&format!("{}/vk_fields.json", output_dir)).await;
        concat_vks.push(Felt::from_dec_str(&vk_fields.len().to_string())?);
        concat_vks.append(&mut vk_fields);
    }

    let execute_vk = concat_vks[227..].to_vec();

    Ok((concat_vks, execute_vk))
}

pub async fn run_bb_prove(
    circuit_json: &str,
    witness: &str,
    output_dir: &str,
    is_keccak: bool,
) -> Result<Output, Box<dyn Error>> {
    let bb_path = get_bb_path()?;

    let mut cmd = Command::new(&bb_path);
    cmd.arg("prove")
        .arg("-s")
        .arg("ultra_honk")
        .arg("-b")
        .arg(format!("../target/{}.json", circuit_json))
        .arg("-w")
        .arg(witness)
        .arg("-o")
        .arg(output_dir)
        .arg("--output_format")
        .arg("bytes_and_fields");

    if is_keccak {
        cmd.arg("--oracle_hash").arg("keccak");
    }

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .output()
        .expect("failed to run `bb prove`");

    Ok(output)
}
