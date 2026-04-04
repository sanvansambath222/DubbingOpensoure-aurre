const axios = require("axios");

// License server URL - change this to your own server
const LICENSE_SERVER = "https://voxidub.com/api/license";

async function checkLicense(key) {
  try {
    const res = await axios.post(`${LICENSE_SERVER}/check`, {
      license_key: key,
      machine_id: getMachineId(),
    });
    return res.data;
  } catch (err) {
    // If server unreachable, deny access (no offline bypass)
    return { valid: false, offline: true, message: "Cannot verify license. Check internet connection." };
  }
}

async function activateLicense(key) {
  try {
    const res = await axios.post(`${LICENSE_SERVER}/activate`, {
      license_key: key,
      machine_id: getMachineId(),
    });
    return res.data;
  } catch (err) {
    return { success: false, message: err.response?.data?.detail || "Server error" };
  }
}

function getMachineId() {
  const os = require("os");
  const crypto = require("crypto");
  const id = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || "unknown"}`;
  return crypto.createHash("md5").update(id).digest("hex");
}

module.exports = { checkLicense, activateLicense, getMachineId };
