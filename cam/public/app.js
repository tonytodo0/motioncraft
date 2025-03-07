// cam/public/app.js
const videoElement = document.getElementById("video");
const canvasElement = document.getElementById("output");
const canvasCtx = canvasElement.getContext("2d");
const motionRecorder = new MotionRecorder();
let ws = null;
let i = 0;
let lastTriggerState = false;
let leftTriggerActive = false;

// Add debug UI
const debugPanel = document.createElement("div");
debugPanel.style.position = "fixed";
debugPanel.style.bottom = "10px";
debugPanel.style.left = "10px";
debugPanel.style.backgroundColor = "rgba(0,0,0,0.7)";
debugPanel.style.color = "white";
debugPanel.style.padding = "10px";
debugPanel.style.borderRadius = "5px";
debugPanel.style.zIndex = "1000";
debugPanel.style.fontFamily = "monospace";
debugPanel.style.fontSize = "12px";
debugPanel.style.maxWidth = "300px";
debugPanel.style.maxHeight = "200px";
debugPanel.style.overflow = "auto";
debugPanel.innerHTML =
  "<div>Motion Recognition Active</div><div>Press D to toggle debug panel</div>" +
  "<div><strong>NEW: Hold left trigger, perform motion, then release to detect</strong></div>" +
  "<div><strong>UPDATED: Location-invariant tracking active!</strong></div>";
document.body.appendChild(debugPanel);

function logDebug(message) {
  const timestamp = new Date().toLocaleTimeString();
  debugPanel.innerHTML += `<div>[${timestamp}] ${message}</div>`;
  // Keep only the last 10 messages
  const messages = debugPanel.querySelectorAll("div");
  if (messages.length > 10) {
    messages[0].remove();
  }
}

let lastControllerData = {
  leftController: null,
  rightController: null,
};

function connectWebSocket() {
  ws = new WebSocket("ws://localhost:5000/ws");

  ws.onopen = () => {
    console.log("WebSocket connection established");
    logDebug("WebSocket connected");
  };

  ws.onclose = (event) => {
    console.log("WebSocket closed with code:", event.code);
    logDebug(`WebSocket closed: ${event.code}`);
    setTimeout(connectWebSocket, 5000); //5s
  };

  ws.onerror = (error) => {
    console.log("WebSocket error occurred:", error);
    logDebug(`WebSocket error: ${error}`);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      lastControllerData = data;

      // Track left trigger state for motion detection
      const leftTriggerValue = data?.leftController?.buttons?.trigger || 0;
      const leftTriggerThreshold = 0.5;

      // Update trigger state indicator
      if (leftTriggerValue >= leftTriggerThreshold && !leftTriggerActive) {
        leftTriggerActive = true;
        logDebug("Left trigger activated - motion recording ON");
        // Add visual indicator
        // showTriggerActiveIndicator(true);
      } else if (leftTriggerValue < leftTriggerThreshold && leftTriggerActive) {
        leftTriggerActive = false;
        logDebug("Left trigger released - checking for motion");
        // Remove visual indicator
        // showTriggerActiveIndicator(false);
      }

      // Handle recording with right controller B button
      const bButtonPressed = data?.rightController?.buttons?.B > 0.5;
      if (bButtonPressed && !lastTriggerState) {
        if (!motionRecorder.isRecording) {
          // Not currently recording - start new recording
          const motionName = `motion_${i}`;
          motionRecorder.startRecording(motionName);
          logDebug(`Started recording: ${motionName}`);
        } else {
          // Already recording - stop recording
          motionRecorder.stopRecording();
          logDebug(`Stopped recording motion_${i}`);
          i++;
        }
      }
      lastTriggerState = bButtonPressed;
    } catch (error) {
      console.error("Error processing message:", error);
      logDebug(`Error processing message: ${error.message}`);
    }
  };
}

// const analysisButton = document.createElement("button");
// analysisButton.textContent = "Motion Analysis";
// analysisButton.style.position = "fixed";
// analysisButton.style.top = "70px";
// analysisButton.style.right = "10px";
// analysisButton.style.padding = "10px";
// analysisButton.style.backgroundColor = "#9C27B0";
// analysisButton.style.color = "white";
// analysisButton.style.border = "none";
// analysisButton.style.borderRadius = "5px";
// analysisButton.style.cursor = "pointer";
// analysisButton.style.zIndex = "1001";
// analysisButton.addEventListener("click", createMotionAnalysisUI);
// document.body.appendChild(analysisButton);

// Add a Motion Mapping button to the main UI
// const motionMappingBtn = document.createElement("button");
// motionMappingBtn.textContent = "Motion Mappings";
// motionMappingBtn.style.position = "fixed";
// motionMappingBtn.style.top = "120px";
// motionMappingBtn.style.right = "10px";
// motionMappingBtn.style.padding = "10px";
// motionMappingBtn.style.backgroundColor = "#8E24AA";
// motionMappingBtn.style.color = "white";
// motionMappingBtn.style.border = "none";
// motionMappingBtn.style.borderRadius = "5px";
// motionMappingBtn.style.cursor = "pointer";
// motionMappingBtn.style.zIndex = "1001";
// motionMappingBtn.addEventListener("click", createMotionMappingUI);
// document.body.appendChild(motionMappingBtn);

// Show a visual indicator when left trigger is active
function showTriggerActiveIndicator(active) {
  return;
  let indicator = document.getElementById("trigger-indicator");

  if (!indicator && active) {
    indicator = document.createElement("div");
    indicator.id = "trigger-indicator";
    indicator.style.position = "fixed";
    indicator.style.top = "20px";
    indicator.style.left = "50%";
    indicator.style.transform = "translateX(-50%)";
    indicator.style.backgroundColor = "rgba(255, 0, 0, 0.7)";
    indicator.style.color = "white";
    indicator.style.padding = "10px 20px";
    indicator.style.borderRadius = "5px";
    indicator.style.fontWeight = "bold";
    indicator.style.zIndex = "2000";
    indicator.textContent = "RECORDING MOTION...";
    document.body.appendChild(indicator);
  } else if (indicator && !active) {
    indicator.remove();
  }
}

// Initialize WebSocket connection
connectWebSocket();

function onResults(results) {
  // Set canvas dimensions to match video
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;

  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(
    results.image,
    0,
    0,
    canvasElement.width,
    canvasElement.height
  );

  if (results.poseLandmarks) {
    // Record frame if recording is active
    motionRecorder.recordFrame(results.poseLandmarks, lastControllerData);

    // Check for recognized motions only if not recording or playing back
    if (!motionRecorder.isRecording && !motionRecorder.isPlaying) {
      const detectedMotion = motionRecorder.lastDetectedMotion;

      if (detectedMotion && detectedMotion !== lastDetectedMotion) {
        console.log(`Motion detected: ${detectedMotion}`);
        logDebug(`Motion detected: ${detectedMotion}`);
        lastDetectedMotion = detectedMotion;

        // Create and dispatch a custom event
        const event = new CustomEvent("motionDetected", {
          detail: {
            motion: detectedMotion,
            timestamp: Date.now(),
          },
        });
        document.dispatchEvent(event);

        // Visual feedback
        const feedback = document.createElement("div");
        feedback.className = "motion-feedback";
        feedback.textContent = `Motion Detected: ${detectedMotion}`;
        feedback.style.position = "fixed";
        feedback.style.top = "20px";
        feedback.style.left = "50%";
        feedback.style.transform = "translateX(-50%)";
        feedback.style.padding = "10px 20px";
        feedback.style.backgroundColor = "rgba(0, 255, 0, 0.7)";
        feedback.style.borderRadius = "5px";
        feedback.style.zIndex = "1000";
        feedback.style.fontWeight = "bold";
        document.body.appendChild(feedback);

        // Remove feedback after 2 seconds
        setTimeout(() => feedback.remove(), 2000);
      }
    }

    // Draw skeleton
    drawSkeleton(results.poseLandmarks, canvasCtx, canvasElement);

    // Display recording/playback state
    if (motionRecorder.isRecording) {
      canvasCtx.fillStyle = "red";
      canvasCtx.font = "24px Arial";
      canvasCtx.fillText("Recording...", 10, 30);

      // Also show frame count
      canvasCtx.fillText(
        `Frames: ${motionRecorder.recordedSequence.length}`,
        10,
        60
      );
    }

    // Display left trigger state
    if (leftTriggerActive) {
      canvasCtx.fillStyle = "yellow";
      canvasCtx.font = "24px Arial";
      canvasCtx.fillText("Recording Motion...", 10, canvasElement.height - 10);
    }

    // Display debug info
    if (results.poseLandmarks.length > 0) {
      // Show left wrist position and movement
      const leftWrist = results.poseLandmarks[15];
      canvasCtx.fillStyle = "yellow";
      canvasCtx.font = "16px Arial";
      canvasCtx.fillText(
        `Left Wrist: x=${leftWrist.x.toFixed(2)}, y=${leftWrist.y.toFixed(2)}`,
        10,
        canvasElement.height - 40
      );
    }
  }
  canvasCtx.restore();
}

let lastDetectedMotion = null;

function drawSkeleton(poseLandmarks, ctx, canvas) {
  const limbs = [
    [11, 12], // Shoulders
    [23, 24], // Hips
    [11, 23],
    [12, 24], // Torso
    [11, 13],
    [13, 15], // Left arm
    [12, 14],
    [14, 16], // Right arm
    [23, 25],
    [25, 27],
    [27, 31], // Left leg
    [24, 26],
    [26, 28],
    [28, 32],
  ];

  for (const [start, end] of limbs) {
    ctx.beginPath();
    ctx.moveTo(
      poseLandmarks[start].x * canvas.width,
      poseLandmarks[start].y * canvas.height
    );
    ctx.lineTo(
      poseLandmarks[end].x * canvas.width,
      poseLandmarks[end].y * canvas.height
    );
    ctx.strokeStyle = "#00FF00";
    ctx.lineWidth = 5;
    ctx.stroke();
  }
}

const pose = new Pose({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
  },
});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

pose.onResults(onResults);

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await pose.send({ image: videoElement });
  },
  width: 1920,
  height: 1080,
});

document.addEventListener("keydown", (event) => {
  switch (event.key) {
    case "r": // Start recording with keyboard
      const motionName = `motion_${i}`;
      motionRecorder.startRecording(motionName);
      logDebug(`Started recording: ${motionName}`);
      break;
    case "s": // Stop recording with keyboard
      motionRecorder.stopRecording();
      logDebug(`Stopped recording motion_${i}`);
      i++;
      break;
    case "p": // Play recorded motion
      const savedMotions = motionRecorder.listSavedMotions();
      if (savedMotions.length === 0) {
        alert("No saved motions available!");
        return;
      }
      const motionToPlay = prompt(
        `Enter motion name to play (Available motions: ${savedMotions.join(
          ", "
        )})`
      );
      if (motionToPlay) {
        motionRecorder.startPlayback(motionToPlay);
        logDebug(`Started playback: ${motionToPlay}`);
      }
      break;
    case "x": // Stop playback
      motionRecorder.stopPlayback();
      logDebug("Stopped playback");
      break;
    case "d": // Toggle debug panel
      debugPanel.style.display =
        debugPanel.style.display === "none" ? "block" : "none";
      break;
    case "v": // Visualize latest motion
      const motions = motionRecorder.listSavedMotions();
      if (motions.length > 0) {
        motionRecorder.visualizeMotion(motions[motions.length - 1]);
      }
      break;
    case "t": // Simulate left trigger press for testing
      leftTriggerActive = !leftTriggerActive;
      logDebug(
        `Testing: Left trigger ${
          leftTriggerActive ? "activated" : "deactivated"
        }`
      );
      // showTriggerActiveIndicator(leftTriggerActive);
      break;
    case "j": // Shortcut for joint importance editor
      const importanceMotions = motionRecorder.listSavedMotions();
      if (importanceMotions.length > 0) {
        const motionToEdit = prompt(
          `Enter motion name to edit importance (Available: ${importanceMotions.join(
            ", "
          )})`
        );
        if (motionToEdit && importanceMotions.includes(motionToEdit)) {
          createJointImportanceUI(motionToEdit);
        }
      }
      break;
  }
});

// Add simple motion testing UI
const motionUI = document.createElement("div");
motionUI.style.position = "fixed";
motionUI.style.top = "10px";
motionUI.style.right = "10px";
motionUI.style.backgroundColor = "rgba(0,0,0,0.7)";
motionUI.style.color = "white";
motionUI.style.padding = "10px";
motionUI.style.borderRadius = "5px";
motionUI.style.zIndex = "1000";
motionUI.innerHTML = `
  <div style="margin-bottom:5px;font-weight:bold;text-align:center;">Motion Controls</div>
  <button id="recordBtn" style="margin:2px;padding:5px;background:#f44336;color:white;border:none;border-radius:3px;">Record</button>
  <button id="stopBtn" style="margin:2px;padding:5px;background:#4CAF50;color:white;border:none;border-radius:3px;">Stop</button>
  <button id="playBtn" style="margin:2px;padding:5px;background:#2196F3;color:white;border:none;border-radius:3px;">Play</button>
     <button id="analysisBtn" style="margin:2px;padding:5px;background:#9C27B0;color:white;border:none;border-radius:3px;">Analysis</button>
    <button id="mappingBtn" style="margin:2px;padding:5px;background:#8E24AA;color:white;border:none;border-radius:3px;">Mappings</button>
   <div style="margin-top:5px;font-size:11px;color:#FFC107;font-weight:bold;">Hold left trigger, perform motion, release to detect</div>
  <div id="motionList" style="margin-top:5px;font-size:12px;"></div>
  <div style="margin-top:8px;">
    <label>Duration Weight: <input type="range" id="durationWeight" min="0.1" max="0.5" step="0.05" style="width:100px"></label>
    <span id="durationValue">0.25</span>
  </div>
  <div>
    <label>Duration Tolerance: <input type="range" id="durationTolerance" min="0.2" max="0.6" step="0.05" style="width:100px"></label>
    <span id="toleranceValue">0.4</span>
  </div>
  <div>
    <label>Key Phase Weight: <input type="range" id="phaseWeight" min="1.0" max="2.0" step="0.1" style="width:100px"></label>
    <span id="phaseValue">1.5</span>
  </div>
`;
document.body.appendChild(motionUI);

// Update the motion list periodically
function updateMotionList() {
  const motionList = document.getElementById("motionList");
  if (motionList) {
    const savedMotions = motionRecorder.listSavedMotions();
    motionList.innerHTML =
      savedMotions.length === 0
        ? "<div>No motions saved</div>"
        : savedMotions.map((m) => `<div>• ${m}</div>`).join("");
  }
  setTimeout(updateMotionList, 2000);
}
updateMotionList();

// Add UI button handlers
document.getElementById("recordBtn").addEventListener("click", () => {
  const motionName = `motion_${i}`;
  motionRecorder.startRecording(motionName);
  logDebug(`Started recording: ${motionName}`);
});

document.getElementById("stopBtn").addEventListener("click", () => {
  if (motionRecorder.isRecording) {
    motionRecorder.stopRecording();
    logDebug(`Stopped recording motion_${i}`);
    i++;
  } else if (motionRecorder.isPlaying) {
    motionRecorder.stopPlayback();
    logDebug("Stopped playback");
  }
});

document.getElementById("playBtn").addEventListener("click", () => {
  const savedMotions = motionRecorder.listSavedMotions();
  if (savedMotions.length === 0) {
    alert("No saved motions available!");
    return;
  }
  const motionToPlay = prompt(
    `Enter motion name to play (Available: ${savedMotions.join(", ")})`
  );
  if (motionToPlay) {
    motionRecorder.startPlayback(motionToPlay);
    logDebug(`Started playback: ${motionToPlay}`);
  }
});
document
  .getElementById("analysisBtn")
  .addEventListener("click", createMotionAnalysisUI);
document
  .getElementById("mappingBtn")
  .addEventListener("click", createMotionMappingUI);

// Create debug UI for motion thresholds with joint importance button
const debugUI = document.createElement("div");
debugUI.style.position = "fixed";
debugUI.style.right = "10px";
debugUI.style.bottom = "10px";
debugUI.style.backgroundColor = "rgba(0,0,0,0.7)";
debugUI.style.color = "white";
debugUI.style.padding = "10px";
debugUI.style.borderRadius = "5px";
debugUI.style.zIndex = "1000";
debugUI.style.fontFamily = "monospace";
debugUI.style.fontSize = "12px";
debugUI.style.maxWidth = "300px";
debugUI.innerHTML = `
  <div style="margin-bottom:8px;font-weight:bold;">Motion Debugger</div>
  <button id="visMotionBtn" style="margin:2px;padding:4px;background:#4CAF50;color:white;border:none;border-radius:3px;">Visualize</button>
  <button id="exportMotionBtn" style="margin:2px;padding:4px;background:#2196F3;color:white;border:none;border-radius:3px;">Export Motion</button>
  <button id="exportAllMotionsBtn" style="margin:2px;padding:4px;background:#009688;color:white;border:none;border-radius:3px;">Export All Motions</button>
  <button id="importMotionBtn" style="margin:2px;padding:4px;background:#673AB7;color:white;border:none;border-radius:3px;">Import Motion</button>
  <button id="importanceBtn" style="margin:2px;padding:4px;background:#9C27B0;color:white;border:none;border-radius:3px;">Joint Importance</button>
  <button id="testThresholdsBtn" style="margin:2px;padding:4px;background:#FF9800;color:white;border:none;border-radius:3px;">Test Thresholds</button>
  <div style="margin-top:8px;">
    <label>Min Movement: <input type="range" id="movementThreshold" min="0.01" max="0.3" step="0.01" style="width:100px"></label>
    <span id="movementValue">0.02</span>
  </div>
  <div>
    <label>Match Threshold: <input type="range" id="matchThreshold" min="0.3" max="0.9" step="0.05" style="width:100px"></label>
    <span id="matchValue">0.6</span>
  </div>
  <div>
    <label>Motion Duration: <input type="range" id="durationThreshold" min="100" max="1000" step="50" style="width:100px"></label>
    <span id="durationValue">200</span>ms
  </div>
`;
document.body.appendChild(debugUI);

// Initialize sliders with current values
document.getElementById("movementThreshold").value =
  motionRecorder.MIN_MOVEMENT_MAGNITUDE;
document.getElementById("movementValue").textContent =
  motionRecorder.MIN_MOVEMENT_MAGNITUDE.toFixed(2);
document.getElementById("matchThreshold").value =
  motionRecorder.SEQUENCE_MATCH_THRESHOLD;
document.getElementById("matchValue").textContent =
  motionRecorder.SEQUENCE_MATCH_THRESHOLD.toFixed(2);
document.getElementById("durationThreshold").value =
  motionRecorder.MIN_MOTION_DURATION;
document.getElementById("durationValue").textContent =
  motionRecorder.MIN_MOTION_DURATION;

// Add event listeners to sliders
document.getElementById("movementThreshold").addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  motionRecorder.MIN_MOVEMENT_MAGNITUDE = value;
  document.getElementById("movementValue").textContent = value.toFixed(2);
  console.log(`MIN_MOVEMENT_MAGNITUDE updated to ${value}`);
});

document.getElementById("matchThreshold").addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  motionRecorder.SEQUENCE_MATCH_THRESHOLD = value;
  document.getElementById("matchValue").textContent = value.toFixed(2);
  console.log(`SEQUENCE_MATCH_THRESHOLD updated to ${value}`);
});

document.getElementById("durationThreshold").addEventListener("input", (e) => {
  const value = parseInt(e.target.value);
  motionRecorder.MIN_MOTION_DURATION = value;
  document.getElementById("durationValue").textContent = value;
  console.log(`MIN_MOTION_DURATION updated to ${value}ms`);
});

document.getElementById("durationWeight").addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  motionRecorder.DURATION_MATCH_WEIGHT = value;
  document.getElementById("durationValue").textContent = value.toFixed(2);
  console.log(`DURATION_MATCH_WEIGHT updated to ${value}`);
});

document.getElementById("durationTolerance").addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  motionRecorder.DURATION_TOLERANCE = value;
  document.getElementById("toleranceValue").textContent = value.toFixed(2);
  console.log(`DURATION_TOLERANCE updated to ${value}`);
});

document.getElementById("phaseWeight").addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  motionRecorder.KEY_PHASE_WEIGHT = value;
  document.getElementById("phaseValue").textContent = value.toFixed(1);
  console.log(`KEY_PHASE_WEIGHT updated to ${value}`);
});

// Add button event listeners
document.getElementById("visMotionBtn").addEventListener("click", () => {
  const savedMotions = motionRecorder.listSavedMotions();
  if (savedMotions.length === 0) {
    alert("No saved motions available!");
    return;
  }

  const motionToVis = prompt(
    `Enter motion name to visualize (Available: ${savedMotions.join(", ")})`
  );

  if (motionToVis) {
    motionRecorder.visualizeMotion(motionToVis);
  }
});

document.getElementById("exportMotionBtn").addEventListener("click", () => {
  const savedMotions = motionRecorder.listSavedMotions();
  if (savedMotions.length === 0) {
    alert("No saved motions available!");
    return;
  }

  const motionToExport = prompt(
    `Enter motion name to export (Available: ${savedMotions.join(", ")})`
  );

  if (motionToExport) {
    motionRecorder.exportMotion(motionToExport);
  }
});

document.getElementById("exportAllMotionsBtn").addEventListener("click", () => {
  const savedMotions = motionRecorder.listSavedMotions();
  if (savedMotions.length === 0) {
    alert("No saved motions available to export!");
    return;
  }

  // Create object with all motions
  const allMotions = {};

  savedMotions.forEach((motionName) => {
    const motionData = motionRecorder.savedMotions.get(motionName);
    const importance = motionRecorder.jointImportance.get(motionName) || {};

    // Add to collection
    allMotions[motionName] = {
      sequence: motionData.sequence,
      metrics: motionData.metrics,
      relativeMotion: motionData.relativeMotion,
      importance: importance,
    };
  });

  // Create downloadable file
  const dataStr = JSON.stringify(allMotions, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(dataBlob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `all_motions_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  logDebug(`Exported all motions (${savedMotions.length} total)`);
});

document.getElementById("importMotionBtn").addEventListener("click", () => {
  // Create a hidden file input element
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  // When a file is selected
  fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) {
      document.body.removeChild(fileInput);
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const jsonData = e.target.result;
        const importedData = JSON.parse(jsonData);

        // Import multiple motions
        let importCount = 0;

        // Check if it's a single motion or multiple motions
        if (importedData.sequence) {
          // Single motion format
          const motionName = file.name
            .replace(/\.json$/, "")
            .replace(/^motion_/, "");
          const success = motionRecorder.importMotion(jsonData, motionName);
          importCount = success ? 1 : 0;
        } else {
          // Multiple motions format
          Object.entries(importedData).forEach(([motionName, motionData]) => {
            // Convert individual motion back to JSON string for compatibility
            const singleMotionJson = JSON.stringify(motionData);
            const success = motionRecorder.importMotion(
              singleMotionJson,
              motionName
            );
            if (success) importCount++;
          });
        }

        if (importCount > 0) {
          alert(
            `Successfully imported ${importCount} motion${
              importCount > 1 ? "s" : ""
            }!`
          );
          updateMotionList();
        } else {
          alert("Failed to import motions. Invalid data format.");
        }
      } catch (error) {
        alert(`Error reading motion file: ${error.message}`);
      }

      // Clean up
      document.body.removeChild(fileInput);
    };

    reader.onerror = () => {
      alert("Error reading file");
      document.body.removeChild(fileInput);
    };

    // Read the file content as text
    reader.readAsText(file);
  });

  // Simulate a click to open the file picker
  fileInput.click();
});

// Add event listener for the joint importance button
document.getElementById("importanceBtn").addEventListener("click", () => {
  const savedMotions = motionRecorder.listSavedMotions();
  if (savedMotions.length === 0) {
    alert("No saved motions available!");
    return;
  }

  // Create motion selector modal
  const selectorModal = document.createElement("div");
  selectorModal.style.position = "fixed";
  selectorModal.style.top = "50%";
  selectorModal.style.left = "50%";
  selectorModal.style.transform = "translate(-50%, -50%)";
  selectorModal.style.backgroundColor = "rgba(20, 20, 30, 0.95)";
  selectorModal.style.padding = "20px";
  selectorModal.style.borderRadius = "10px";
  selectorModal.style.zIndex = "10000";
  selectorModal.style.boxShadow = "0 0 20px rgba(0, 0, 0, 0.5)";
  selectorModal.style.minWidth = "300px";

  selectorModal.innerHTML = `
    <h3 style="color:#4CAF50;margin-top:0;margin-bottom:15px;text-align:center;">Select Motion</h3>
    <p style="margin-bottom:15px;color:#BBB;text-align:center;font-size:14px;">Choose a motion to edit joint importance</p>
    <div style="max-height:300px;overflow-y:auto;">
      <ul id="motion-selector-list" style="list-style:none;padding:0;margin:0;">
        ${savedMotions
          .map(
            (motion) => `
          <li class="motion-item" data-motion="${motion}" style="padding:10px 15px;margin:5px 0;background:rgba(40,40,50,0.8);border-radius:5px;cursor:pointer;transition:all 0.2s;display:flex;justify-content:space-between;align-items:center;">
            <span style="color:white">${motion}</span>
            <span style="width:24px;height:24px;border-radius:50%;background:#9C27B0;display:flex;align-items:center;justify-content:center;">→</span>
          </li>
        `
          )
          .join("")}
      </ul>
    </div>
    <div style="text-align:right;margin-top:15px;">
      <button id="close-selector-btn" style="padding:8px 15px;background:#f44336;color:white;border:none;border-radius:4px;cursor:pointer;">Cancel</button>
    </div>
  `;

  document.body.appendChild(selectorModal);

  // Add hover effect to motion items
  const motionItems = selectorModal.querySelectorAll(".motion-item");
  motionItems.forEach((item) => {
    item.addEventListener("mouseenter", () => {
      item.style.background = "rgba(60,60,70,0.8)";
      item.style.transform = "translateX(5px)";
    });

    item.addEventListener("mouseleave", () => {
      item.style.background = "rgba(40,40,50,0.8)";
      item.style.transform = "translateX(0)";
    });

    item.addEventListener("click", () => {
      const motionName = item.getAttribute("data-motion");
      selectorModal.remove();
      createJointImportanceUI(motionName);
    });
  });

  // Close button
  document
    .getElementById("close-selector-btn")
    .addEventListener("click", () => {
      selectorModal.remove();
    });
});

document.getElementById("testThresholdsBtn").addEventListener("click", () => {
  // Create a popup for real-time threshold testing
  const testUI = document.createElement("div");
  testUI.style.position = "fixed";
  testUI.style.top = "50%";
  testUI.style.left = "50%";
  testUI.style.transform = "translate(-50%, -50%)";
  testUI.style.width = "500px";
  testUI.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
  testUI.style.color = "white";
  testUI.style.padding = "20px";
  testUI.style.borderRadius = "10px";
  testUI.style.zIndex = "10001";
  testUI.innerHTML = `
    <h3>Threshold Tester</h3>
    <p>Adjust thresholds and see how they affect motion detection in real-time.</p>
    <p style="color:#FFC107;font-weight:bold;">Remember: Hold left trigger while performing motion, then release to detect!</p>
    <p style="color:#4CAF50;">NEW: Location-independent motion tracking is now active!</p>
    <button id="closeTestBtn" style="position:absolute;top:10px;right:10px;">Close</button>
    <div id="testResults" style="margin-top:15px;height:200px;overflow:auto;background:#222;padding:10px;border-radius:5px;font-size:11px;"></div>
  `;
  document.body.appendChild(testUI);

  document.getElementById("closeTestBtn").addEventListener("click", () => {
    testUI.remove();
    clearInterval(testInterval);
  });

  const resultsDiv = document.getElementById("testResults");

  // Run a test every second
  const testInterval = setInterval(() => {
    // Display trigger status
    resultsDiv.innerHTML =
      `
      <div>Left trigger: <span style="color:${
        leftTriggerActive ? "#4CAF50" : "#F44336"
      }">${leftTriggerActive ? "ACTIVE" : "INACTIVE"}</span></div>
      <div>Test with current thresholds:</div>
      <div>Min Movement: ${motionRecorder.MIN_MOVEMENT_MAGNITUDE.toFixed(
        2
      )}</div>
      <div>Match Threshold: ${motionRecorder.SEQUENCE_MATCH_THRESHOLD.toFixed(
        2
      )}</div>
      <div>Motion Duration: ${motionRecorder.MIN_MOTION_DURATION}ms</div>
      <div>Last Detected: ${motionRecorder.lastDetectedMotion || "None"}</div>
    ` + resultsDiv.innerHTML;

    // Keep only recent entries
    const entries = resultsDiv.childNodes;
    if (entries.length > 20) {
      for (let i = 20; i < entries.length; i++) {
        if (entries[i]) entries[i].remove();
      }
    }
  }, 1000);
});

// Handle motion detected events
document.addEventListener("motionDetected", (event) => {
  const { motion, timestamp } = event.detail;
  // Store the last match details in the motionRecorder for UI access
  if (motionRecorder.lastMatchDetails) {
    logDebug(
      `Motion detected: ${motion} (score: ${motionRecorder.lastMatchDetails.score.toFixed(
        2
      )}) at ${new Date(timestamp).toLocaleTimeString()}`
    );
  } else {
    logDebug(
      `Motion detected: ${motion} at ${new Date(
        timestamp
      ).toLocaleTimeString()}`
    );
  }
});

function createMotionAnalysisUI() {
  // Create a popup for more detailed motion analysis
  const analysisUI = document.createElement("div");
  analysisUI.style.position = "fixed";
  analysisUI.style.top = "50%";
  analysisUI.style.left = "50%";
  analysisUI.style.transform = "translate(-50%, -50%)";
  analysisUI.style.width = "700px";
  analysisUI.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
  analysisUI.style.color = "white";
  analysisUI.style.padding = "20px";
  analysisUI.style.borderRadius = "10px";
  analysisUI.style.zIndex = "10001";
  analysisUI.style.maxHeight = "80vh";
  analysisUI.style.overflow = "auto";
  analysisUI.innerHTML = `
    <h3>Motion Analysis</h3>
    <p>Record motions and view detailed matching analysis</p>
    <button id="closeAnalysisBtn" style="position:absolute;top:10px;right:10px;">Close</button>
    
    <div style="display:flex;justify-content:space-between;margin-top:20px;">
      <div>
        <button id="recordAnalysisBtn" style="background:#f44336;color:white;border:none;padding:8px;border-radius:4px;margin-right:10px;">Record</button>
        <button id="stopAnalysisBtn" style="background:#4CAF50;color:white;border:none;padding:8px;border-radius:4px;margin-right:10px;">Stop</button>
        <button id="testAnalysisBtn" style="background:#2196F3;color:white;border:none;padding:8px;border-radius:4px;">Test</button>
      </div>
      <div style="margin-left:20px;">
        <select id="motionSelector" style="padding:8px;background:#222;color:white;border:1px solid #444;border-radius:4px;">
          <option value="">-- Select motion --</option>
        </select>
      </div>
    </div>
    
    <div id="analysisChart" style="width:100%;height:300px;background:#222;margin-top:20px;position:relative;">
      <canvas id="phaseCanvas" width="650" height="100" style="position:absolute;top:0;left:0;"></canvas>
      <canvas id="motionCanvas" width="650" height="200" style="position:absolute;top:100;left:0;"></canvas>
    </div>
    
    <div id="analysisResults" style="margin-top:20px;background:#222;padding:10px;border-radius:5px;font-family:monospace;font-size:12px;height:150px;overflow:auto;">
      <div>Record or test a motion to see detailed results</div>
    </div>
  `;
  document.body.appendChild(analysisUI);

  document.getElementById("closeAnalysisBtn").addEventListener("click", () => {
    analysisUI.remove();
  });

  // Fill motion selector
  function updateMotionSelector() {
    const selector = document.getElementById("motionSelector");
    const savedMotions = motionRecorder.listSavedMotions();

    // Clear current options except the first
    while (selector.options.length > 1) {
      selector.remove(1);
    }

    // Add motion options
    savedMotions.forEach((motion) => {
      const option = document.createElement("option");
      option.value = motion;
      option.textContent = motion;
      selector.appendChild(option);
    });
  }
  updateMotionSelector();

  // Record button
  document.getElementById("recordAnalysisBtn").addEventListener("click", () => {
    const motionName = prompt("Enter name for the motion:");
    if (motionName) {
      motionRecorder.startRecording(motionName);
      document.getElementById(
        "analysisResults"
      ).innerHTML = `<div>Recording motion: ${motionName}...</div>`;
    }
  });

  // Stop button
  document.getElementById("stopAnalysisBtn").addEventListener("click", () => {
    if (motionRecorder.isRecording) {
      motionRecorder.stopRecording();
      document.getElementById(
        "analysisResults"
      ).innerHTML += `<div>Recording stopped</div>`;
      updateMotionSelector();

      // Draw the phase importance for the last recorded motion
      const lastMotion = motionRecorder.listSavedMotions().pop();
      if (lastMotion) {
        drawMotionPhases(lastMotion);
      }
    }
  });

  // Test button
  document.getElementById("testAnalysisBtn").addEventListener("click", () => {
    const results = document.getElementById("analysisResults");
    results.innerHTML = `<div>Hold left trigger, perform motion, release to test...</div>`;

    // Create a temporary event listener to show results
    const listener = (event) => {
      const motion = event.detail.motion;
      const savedMotions = motionRecorder.listSavedMotions();

      // Get additional match details if available
      let matchDetails = null;
      if (motionRecorder.lastMatchDetails) {
        matchDetails = motionRecorder.lastMatchDetails;
      }

      results.innerHTML = `
        <div style="color:#4CAF50;font-weight:bold;">Motion Detected: ${motion}</div>
        ${
          matchDetails
            ? `
          <div>Score: ${matchDetails.score.toFixed(2)}</div>
          <div>Angle Score: ${matchDetails.angleScore.toFixed(2)}</div>
          <div>Distance Score: ${matchDetails.distanceScore.toFixed(2)}</div>
          <div>Duration Score: ${matchDetails.durationScore.toFixed(2)}</div>
          <div>Current Duration: ${matchDetails.currentDuration}ms</div>
          <div>Reference Duration: ${matchDetails.savedDuration}ms</div>
        `
            : ""
        }
      `;

      // Also draw the phase importance
      drawMotionPhases(motion);

      // Remove this listener
      document.removeEventListener("motionDetected", listener);
    };

    document.addEventListener("motionDetected", listener);
  });

  // Motion selector change
  document.getElementById("motionSelector").addEventListener("change", (e) => {
    const motionName = e.target.value;
    if (motionName) {
      drawMotionPhases(motionName);
    }
  });

  // Function to draw motion phases and data
  function drawMotionPhases(motionName) {
    const motion = motionRecorder.savedMotions.get(motionName);
    if (!motion || !motion.relativeMotion) return;

    const phaseCanvas = document.getElementById("phaseCanvas");
    const phaseCtx = phaseCanvas.getContext("2d");
    const motionCanvas = document.getElementById("motionCanvas");
    const motionCtx = motionCanvas.getContext("2d");

    // Clear canvases
    phaseCtx.clearRect(0, 0, phaseCanvas.width, phaseCanvas.height);
    motionCtx.clearRect(0, 0, motionCanvas.width, motionCanvas.height);

    // Calculate phase importance
    const phaseImportance = motionRecorder.calculatePhaseImportance(
      motion.relativeMotion
    );

    // Draw phase importance
    phaseCtx.fillStyle = "#333";
    phaseCtx.fillRect(0, 0, phaseCanvas.width, phaseCanvas.height);

    phaseCtx.font = "12px Arial";
    phaseCtx.fillStyle = "white";
    phaseCtx.fillText("Motion Phase Importance:", 10, 20);

    const xScale = phaseCanvas.width / phaseImportance.length;
    const maxImportance = Math.max(...phaseImportance);

    // Draw bars for phase importance
    for (let i = 0; i < phaseImportance.length; i++) {
      const x = i * xScale;
      const height = (phaseImportance[i] / maxImportance) * 60;
      const y = phaseCanvas.height - height - 20;

      phaseCtx.fillStyle = phaseImportance[i] > 1.0 ? "#FF9800" : "#2196F3";
      phaseCtx.fillRect(x, y, xScale - 1, height);
    }

    // Draw timeline
    phaseCtx.fillStyle = "#666";
    phaseCtx.fillRect(0, phaseCanvas.height - 20, phaseCanvas.width, 1);

    const duration = motion.metrics.duration;
    phaseCtx.fillStyle = "#999";
    phaseCtx.font = "10px Arial";
    phaseCtx.fillText("0ms", 5, phaseCanvas.height - 5);
    phaseCtx.fillText(
      `${duration}ms`,
      phaseCanvas.width - 40,
      phaseCanvas.height - 5
    );

    // Draw motion data on the second canvas
    motionCtx.fillStyle = "#222";
    motionCtx.fillRect(0, 0, motionCanvas.width, motionCanvas.height);

    // Draw grid
    motionCtx.strokeStyle = "#333";
    motionCtx.lineWidth = 1;
    for (let i = 0; i < motionCanvas.width; i += 50) {
      motionCtx.beginPath();
      motionCtx.moveTo(i, 0);
      motionCtx.lineTo(i, motionCanvas.height);
      motionCtx.stroke();
    }
    for (let i = 0; i < motionCanvas.height; i += 25) {
      motionCtx.beginPath();
      motionCtx.moveTo(0, i);
      motionCtx.lineTo(motionCanvas.width, i);
      motionCtx.stroke();
    }

    // Calculate movement magnitudes
    const relativeMotion = motion.relativeMotion;
    const movementData = [];

    for (let i = 1; i < relativeMotion.length; i++) {
      const frame = relativeMotion[i];
      let angleMagnitude = 0;
      let distanceMagnitude = 0;

      if (frame.angleChanges) {
        const angles = Object.values(frame.angleChanges).map((v) =>
          Math.abs(v)
        );
        if (angles.length > 0) {
          angleMagnitude = angles.reduce((a, b) => a + b, 0) / angles.length;
        }
      }

      if (frame.distanceChanges) {
        const distances = Object.values(frame.distanceChanges).map(
          (v) => Math.abs(v) * 10
        ); // Scale up
        if (distances.length > 0) {
          distanceMagnitude =
            distances.reduce((a, b) => a + b, 0) / distances.length;
        }
      }

      movementData.push({
        timestamp: frame.timestamp,
        angleMagnitude,
        distanceMagnitude,
      });
    }

    // Find max values for scaling
    const maxAngleMag = Math.max(
      ...movementData.map((d) => d.angleMagnitude),
      0.1
    );
    const maxDistMag = Math.max(
      ...movementData.map((d) => d.distanceMagnitude),
      0.1
    );

    // Draw lines for angle and distance magnitudes
    const timeScale = motionCanvas.width / duration;

    // Draw angle magnitudes
    motionCtx.beginPath();
    motionCtx.strokeStyle = "#4CAF50";
    motionCtx.lineWidth = 2;

    for (let i = 0; i < movementData.length; i++) {
      const data = movementData[i];
      const x = data.timestamp * timeScale;
      const y =
        motionCanvas.height -
        (data.angleMagnitude / maxAngleMag) * (motionCanvas.height - 40);

      if (i === 0) {
        motionCtx.moveTo(x, y);
      } else {
        motionCtx.lineTo(x, y);
      }
    }
    motionCtx.stroke();

    // Draw distance magnitudes
    motionCtx.beginPath();
    motionCtx.strokeStyle = "#2196F3";
    motionCtx.lineWidth = 2;

    for (let i = 0; i < movementData.length; i++) {
      const data = movementData[i];
      const x = data.timestamp * timeScale;
      const y =
        motionCanvas.height -
        (data.distanceMagnitude / maxDistMag) * (motionCanvas.height - 40);

      if (i === 0) {
        motionCtx.moveTo(x, y);
      } else {
        motionCtx.lineTo(x, y);
      }
    }
    motionCtx.stroke();

    // Add legend
    motionCtx.fillStyle = "#4CAF50";
    motionCtx.fillRect(10, 10, 10, 10);
    motionCtx.fillStyle = "white";
    motionCtx.font = "12px Arial";
    motionCtx.fillText("Angle Changes", 25, 20);

    motionCtx.fillStyle = "#2196F3";
    motionCtx.fillRect(10, 30, 10, 10);
    motionCtx.fillStyle = "white";
    motionCtx.fillText("Distance Changes", 25, 40);
  }
}

// Create the Motion Mapping UI
function createMotionMappingUI() {
  // Create modal container
  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "50%";
  modal.style.left = "50%";
  modal.style.transform = "translate(-50%, -50%)";
  modal.style.width = "80%";
  modal.style.maxWidth = "800px";
  modal.style.backgroundColor = "rgba(30, 30, 40, 0.95)";
  modal.style.padding = "20px";
  modal.style.borderRadius = "10px";
  modal.style.zIndex = "10000";
  modal.style.boxShadow = "0 0 20px rgba(0, 0, 0, 0.5)";
  modal.style.color = "white";
  modal.style.fontFamily = "Arial, sans-serif";
  modal.style.maxHeight = "80vh";
  modal.style.overflow = "auto";

  // Add title
  const title = document.createElement("h2");
  title.textContent = "Motion-to-Key Mappings";
  title.style.borderBottom = "1px solid rgba(255, 255, 255, 0.2)";
  title.style.paddingBottom = "10px";
  title.style.marginBottom = "20px";
  title.style.color = "#8E24AA";
  modal.appendChild(title);

  // Add description
  const description = document.createElement("p");
  description.textContent =
    "Map your recorded motions to keyboard shortcuts that will be sent to WoW when the motion is detected.";
  description.style.marginBottom = "20px";
  modal.appendChild(description);

  // Add close button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "10px";
  closeBtn.style.right = "15px";
  closeBtn.style.background = "none";
  closeBtn.style.border = "none";
  closeBtn.style.color = "white";
  closeBtn.style.fontSize = "24px";
  closeBtn.style.cursor = "pointer";
  closeBtn.onclick = () => modal.remove();
  modal.appendChild(closeBtn);

  // Create mappings container
  const mappingsContainer = document.createElement("div");
  mappingsContainer.style.marginBottom = "20px";
  modal.appendChild(mappingsContainer);

  // Get saved motions
  const savedMotions = motionRecorder.listSavedMotions();

  if (savedMotions.length === 0) {
    const noMotionsMsg = document.createElement("div");
    noMotionsMsg.textContent =
      "No saved motions available. Record motions first before creating mappings.";
    noMotionsMsg.style.padding = "10px";
    noMotionsMsg.style.backgroundColor = "rgba(255, 152, 0, 0.2)";
    noMotionsMsg.style.borderRadius = "5px";
    noMotionsMsg.style.marginBottom = "20px";
    mappingsContainer.appendChild(noMotionsMsg);
  } else {
    // List existing mappings
    const existingMappings = motionRecorder.getAllMotionKeyMappings();

    if (existingMappings.length > 0) {
      const mappingsTitle = document.createElement("h3");
      mappingsTitle.textContent = "Current Mappings";
      mappingsTitle.style.marginBottom = "10px";
      mappingsContainer.appendChild(mappingsTitle);

      const mappingsList = document.createElement("div");
      mappingsList.style.marginBottom = "20px";

      existingMappings.forEach((mapping) => {
        const mappingItem = document.createElement("div");
        mappingItem.style.display = "flex";
        mappingItem.style.justifyContent = "space-between";
        mappingItem.style.alignItems = "center";
        mappingItem.style.padding = "10px";
        mappingItem.style.marginBottom = "5px";
        mappingItem.style.backgroundColor = "rgba(60, 60, 70, 0.5)";
        mappingItem.style.borderRadius = "5px";

        const mappingInfo = document.createElement("div");
        mappingInfo.innerHTML = `<strong>${
          mapping.motion
        }</strong> → ${formatKeyConfig(mapping.keyConfig)}`;
        mappingItem.appendChild(mappingInfo);

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.style.padding = "5px 10px";
        deleteBtn.style.backgroundColor = "#F44336";
        deleteBtn.style.color = "white";
        deleteBtn.style.border = "none";
        deleteBtn.style.borderRadius = "3px";
        deleteBtn.style.cursor = "pointer";
        deleteBtn.onclick = () => {
          motionRecorder.removeMotionKeyMapping(mapping.motion);
          refreshMappingUI();
        };
        mappingItem.appendChild(deleteBtn);

        mappingsList.appendChild(mappingItem);
      });

      mappingsContainer.appendChild(mappingsList);
    }

    // Create form for adding new mappings
    const formTitle = document.createElement("h3");
    formTitle.textContent = "Add New Mapping";
    formTitle.style.marginBottom = "10px";
    mappingsContainer.appendChild(formTitle);

    const form = document.createElement("div");
    form.style.backgroundColor = "rgba(40, 40, 50, 0.5)";
    form.style.padding = "15px";
    form.style.borderRadius = "5px";

    // Motion selector
    const motionSelectLabel = document.createElement("label");
    motionSelectLabel.textContent = "Select Motion:";
    motionSelectLabel.style.display = "block";
    motionSelectLabel.style.marginBottom = "5px";
    form.appendChild(motionSelectLabel);

    const motionSelect = document.createElement("select");
    motionSelect.style.width = "100%";
    motionSelect.style.padding = "8px";
    motionSelect.style.marginBottom = "15px";
    motionSelect.style.backgroundColor = "#333";
    motionSelect.style.color = "white";
    motionSelect.style.border = "1px solid #555";
    motionSelect.style.borderRadius = "3px";

    // Add default option
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "-- Select a motion --";
    motionSelect.appendChild(defaultOption);

    // Add motions to select
    savedMotions.forEach((motion) => {
      const option = document.createElement("option");
      option.value = motion;
      option.textContent = motion;
      motionSelect.appendChild(option);
    });
    form.appendChild(motionSelect);

    // Key input
    const keyInputLabel = document.createElement("label");
    keyInputLabel.textContent = "Key to Press:";
    keyInputLabel.style.display = "block";
    keyInputLabel.style.marginBottom = "5px";
    form.appendChild(keyInputLabel);

    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.placeholder = "e.g. f, space, shift+f, ctrl+1";
    keyInput.style.width = "100%";
    keyInput.style.padding = "8px";
    keyInput.style.marginBottom = "15px";
    keyInput.style.backgroundColor = "#333";
    keyInput.style.color = "white";
    keyInput.style.border = "1px solid #555";
    keyInput.style.borderRadius = "3px";
    keyInput.style.boxSizing = "border-box";
    form.appendChild(keyInput);

    // Add advanced options (hold key, press/release)
    const advancedOptionsToggle = document.createElement("div");
    advancedOptionsToggle.innerHTML = "Advanced Options <span>▶</span>";
    advancedOptionsToggle.style.cursor = "pointer";
    advancedOptionsToggle.style.marginBottom = "10px";
    advancedOptionsToggle.style.color = "#64B5F6";
    form.appendChild(advancedOptionsToggle);

    const advancedOptionsPanel = document.createElement("div");
    advancedOptionsPanel.style.display = "none";
    advancedOptionsPanel.style.backgroundColor = "rgba(30, 30, 40, 0.5)";
    advancedOptionsPanel.style.padding = "10px";
    advancedOptionsPanel.style.borderRadius = "5px";
    advancedOptionsPanel.style.marginBottom = "15px";

    // Key behavior options
    const behaviorLabel = document.createElement("div");
    behaviorLabel.textContent = "Key Behavior:";
    behaviorLabel.style.marginBottom = "5px";
    advancedOptionsPanel.appendChild(behaviorLabel);

    const behaviorOptions = document.createElement("div");

    // Press and release (default)
    const pressReleaseOption = document.createElement("div");
    const pressReleaseRadio = document.createElement("input");
    pressReleaseRadio.type = "radio";
    pressReleaseRadio.name = "keyBehavior";
    pressReleaseRadio.value = "press_release";
    pressReleaseRadio.id = "press_release";
    pressReleaseRadio.checked = true;
    const pressReleaseLabel = document.createElement("label");
    pressReleaseLabel.textContent = "Press and release immediately";
    pressReleaseLabel.htmlFor = "press_release";
    pressReleaseOption.appendChild(pressReleaseRadio);
    pressReleaseOption.appendChild(pressReleaseLabel);
    behaviorOptions.appendChild(pressReleaseOption);

    // Hold until next motion
    const holdOption = document.createElement("div");
    const holdRadio = document.createElement("input");
    holdRadio.type = "radio";
    holdRadio.name = "keyBehavior";
    holdRadio.value = "hold";
    holdRadio.id = "hold";
    const holdLabel = document.createElement("label");
    holdLabel.textContent = "Hold key down until next motion";
    holdLabel.htmlFor = "hold";
    holdOption.appendChild(holdRadio);
    holdOption.appendChild(holdLabel);
    behaviorOptions.appendChild(holdOption);

    // Toggle
    const toggleOption = document.createElement("div");
    const toggleRadio = document.createElement("input");
    toggleRadio.type = "radio";
    toggleRadio.name = "keyBehavior";
    toggleRadio.value = "toggle";
    toggleRadio.id = "toggle";
    const toggleLabel = document.createElement("label");
    toggleLabel.textContent = "Toggle key (press once, press again to release)";
    toggleLabel.htmlFor = "toggle";
    toggleOption.appendChild(toggleRadio);
    toggleOption.appendChild(toggleLabel);
    behaviorOptions.appendChild(toggleOption);

    advancedOptionsPanel.appendChild(behaviorOptions);
    form.appendChild(advancedOptionsPanel);

    // Toggle advanced options display
    advancedOptionsToggle.onclick = () => {
      const isVisible = advancedOptionsPanel.style.display !== "none";
      advancedOptionsPanel.style.display = isVisible ? "none" : "block";
      advancedOptionsToggle.innerHTML = `Advanced Options <span>${
        isVisible ? "▶" : "▼"
      }</span>`;
    };

    // Add buttons
    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.gap = "10px";
    buttonContainer.style.marginTop = "10px";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.padding = "8px 15px";
    cancelBtn.style.backgroundColor = "#555";
    cancelBtn.style.color = "white";
    cancelBtn.style.border = "none";
    cancelBtn.style.borderRadius = "3px";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.onclick = () => {
      motionSelect.value = "";
      keyInput.value = "";
      pressReleaseRadio.checked = true;
    };
    buttonContainer.appendChild(cancelBtn);

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save Mapping";
    saveBtn.style.padding = "8px 15px";
    saveBtn.style.backgroundColor = "#4CAF50";
    saveBtn.style.color = "white";
    saveBtn.style.border = "none";
    saveBtn.style.borderRadius = "3px";
    saveBtn.style.cursor = "pointer";
    saveBtn.onclick = () => {
      if (!motionSelect.value || !keyInput.value) {
        alert("Please select a motion and enter a key");
        return;
      }

      // Get selected behavior
      let behavior = "press_release";
      if (holdRadio.checked) behavior = "hold";
      if (toggleRadio.checked) behavior = "toggle";

      // Create key configuration
      const keyConfig = {
        key: keyInput.value.trim(),
        behavior: behavior,
      };

      // Save mapping
      motionRecorder.setMotionKeyMapping(motionSelect.value, keyConfig);

      // Reset form
      motionSelect.value = "";
      keyInput.value = "";
      pressReleaseRadio.checked = true;

      // Refresh UI
      refreshMappingUI();

      // Provide feedback
      logDebug(
        `Mapped motion "${motionSelect.value}" to key: ${keyInput.value}`
      );
    };
    buttonContainer.appendChild(saveBtn);

    form.appendChild(buttonContainer);
    mappingsContainer.appendChild(form);
  }

  // Export/Import section
  const exportImportSection = document.createElement("div");
  exportImportSection.style.marginTop = "20px";
  exportImportSection.style.borderTop = "1px solid rgba(255, 255, 255, 0.2)";
  exportImportSection.style.paddingTop = "20px";

  const exportImportTitle = document.createElement("h3");
  exportImportTitle.textContent = "Export/Import Mappings";
  exportImportTitle.style.marginBottom = "10px";
  exportImportSection.appendChild(exportImportTitle);

  const exportImportButtonsContainer = document.createElement("div");
  exportImportButtonsContainer.style.display = "flex";
  exportImportButtonsContainer.style.gap = "10px";

  const exportBtn = document.createElement("button");
  exportBtn.textContent = "Export Mappings";
  exportBtn.style.padding = "8px 15px";
  exportBtn.style.backgroundColor = "#2196F3";
  exportBtn.style.color = "white";
  exportBtn.style.border = "none";
  exportBtn.style.borderRadius = "3px";
  exportBtn.style.cursor = "pointer";
  exportBtn.onclick = () => {
    const mappings = motionRecorder.getAllMotionKeyMappings();
    if (mappings.length === 0) {
      alert("No mappings to export");
      return;
    }

    const dataStr = JSON.stringify(mappings, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `motion_mappings_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logDebug(`Exported ${mappings.length} motion mappings`);
  };
  exportImportButtonsContainer.appendChild(exportBtn);

  const importBtn = document.createElement("button");
  importBtn.textContent = "Import Mappings";
  importBtn.style.padding = "8px 15px";
  importBtn.style.backgroundColor = "#FF9800";
  importBtn.style.color = "white";
  importBtn.style.border = "none";
  importBtn.style.borderRadius = "3px";
  importBtn.style.cursor = "pointer";
  importBtn.onclick = () => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    fileInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const mappings = JSON.parse(e.target.result);
          let importCount = 0;

          mappings.forEach((mapping) => {
            if (mapping.motion && mapping.keyConfig && mapping.keyConfig.key) {
              motionRecorder.setMotionKeyMapping(
                mapping.motion,
                mapping.keyConfig
              );
              importCount++;
            }
          });

          if (importCount > 0) {
            alert(`Successfully imported ${importCount} mappings`);
            refreshMappingUI();
          } else {
            alert("No valid mappings found in the file");
          }

          document.body.removeChild(fileInput);
        } catch (error) {
          alert(`Error importing mappings: ${error.message}`);
          document.body.removeChild(fileInput);
        }
      };

      reader.readAsText(file);
    });

    fileInput.click();
  };
  exportImportButtonsContainer.appendChild(importBtn);

  exportImportSection.appendChild(exportImportButtonsContainer);
  modal.appendChild(exportImportSection);

  // Add test button
  const testSection = document.createElement("div");
  testSection.style.marginTop = "20px";
  testSection.style.borderTop = "1px solid rgba(255, 255, 255, 0.2)";
  testSection.style.paddingTop = "20px";

  const testTitle = document.createElement("h3");
  testTitle.textContent = "Test Mappings";
  testTitle.style.marginBottom = "10px";
  testSection.appendChild(testTitle);

  const testDescription = document.createElement("p");
  testDescription.textContent =
    "Test your mappings by performing the motions. Hold left trigger, perform the motion, then release to detect.";
  testDescription.style.marginBottom = "10px";
  testSection.appendChild(testDescription);

  const testStatusContainer = document.createElement("div");
  testStatusContainer.style.backgroundColor = "rgba(40, 40, 50, 0.5)";
  testStatusContainer.style.padding = "10px";
  testStatusContainer.style.borderRadius = "5px";
  testStatusContainer.style.marginBottom = "10px";
  testStatusContainer.innerHTML =
    "<div>No motion detected yet. Hold left trigger and perform a motion.</div>";
  testSection.appendChild(testStatusContainer);

  // Add event listener for motion detection
  const originalMotionDetectedHandler = document.onmotiondetected;

  document.addEventListener("motionDetected", (event) => {
    const { motion } = event.detail;
    const mapping = motionRecorder.getMotionKeyMapping(motion);

    if (mapping) {
      testStatusContainer.innerHTML = `
        <div style="color:#4CAF50;font-weight:bold;">Motion detected: ${motion}</div>
        <div>Mapped to key: ${formatKeyConfig(mapping)}</div>
        <div>Action: ${
          mapping.behavior === "press_release"
            ? "Press and release"
            : mapping.behavior === "hold"
            ? "Hold down"
            : "Toggle"
        }</div>
      `;
    } else {
      testStatusContainer.innerHTML = `
        <div style="color:#FF9800;font-weight:bold;">Motion detected: ${motion}</div>
        <div>No key mapping found for this motion</div>
      `;
    }
  });

  modal.appendChild(testSection);
  document.body.appendChild(modal);

  // Function to refresh the mapping UI
  function refreshMappingUI() {
    // Remove the modal and recreate it
    modal.remove();
    createMotionMappingUI();
  }

  // Helper function to format key config display
  function formatKeyConfig(keyConfig) {
    if (!keyConfig) return "Invalid config";

    let display = `<kbd style="background-color:#333;padding:2px 5px;border-radius:3px;">${keyConfig.key}</kbd>`;

    if (keyConfig.behavior === "hold") {
      display += " (hold down)";
    } else if (keyConfig.behavior === "toggle") {
      display += " (toggle)";
    }

    return display;
  }
}

// Joint Importance UI function
function createJointImportanceUI(motionName) {
  // Check if UI already exists and remove it
  const existingUI = document.getElementById("joint-importance-ui");
  if (existingUI) {
    existingUI.remove();
  }

  // Create UI container
  const importanceUI = document.createElement("div");
  importanceUI.id = "joint-importance-ui";
  importanceUI.style.position = "fixed";
  importanceUI.style.top = "50%";
  importanceUI.style.left = "50%";
  importanceUI.style.transform = "translate(-50%, -50%)";
  importanceUI.style.width = "90%";
  importanceUI.style.maxWidth = "1000px";
  importanceUI.style.maxHeight = "85%";
  importanceUI.style.backgroundColor = "rgba(20, 20, 30, 0.95)";
  importanceUI.style.padding = "24px";
  importanceUI.style.borderRadius = "10px";
  importanceUI.style.zIndex = "10000";
  importanceUI.style.color = "white";
  importanceUI.style.fontFamily = "Arial, sans-serif";
  importanceUI.style.overflow = "auto";
  importanceUI.style.boxShadow = "0 0 20px rgba(0, 0, 0, 0.5)";
  importanceUI.style.display = "flex";
  importanceUI.style.flexDirection = "column";

  // Add title
  const title = document.createElement("h2");
  title.textContent = `Joint Importance: ${motionName}`;
  title.style.marginBottom = "15px";
  title.style.borderBottom = "1px solid rgba(255, 255, 255, 0.2)";
  title.style.paddingBottom = "10px";
  title.style.color = "#4CAF50";
  importanceUI.appendChild(title);

  // Add description
  const description = document.createElement("p");
  description.style.marginBottom = "15px";
  description.innerHTML =
    "Adjust the importance of each joint for motion detection<br><span style='color:#BBBBBB;font-size:12px;'>(0 = ignore, 1 = maximum importance)</span>";
  importanceUI.appendChild(description);

  // Create Auto-Suggest button
  const suggestBtn = document.createElement("button");
  suggestBtn.textContent = "Auto-Suggest Importance";
  suggestBtn.style.position = "absolute";
  suggestBtn.style.top = "15px";
  suggestBtn.style.right = "220px";
  suggestBtn.style.padding = "8px 15px";
  suggestBtn.style.backgroundColor = "#FF9800";
  suggestBtn.style.color = "white";
  suggestBtn.style.border = "none";
  suggestBtn.style.borderRadius = "4px";
  suggestBtn.style.cursor = "pointer";
  suggestBtn.style.fontWeight = "bold";
  suggestBtn.style.transition = "background-color 0.2s";
  suggestBtn.onmouseover = () => (suggestBtn.style.backgroundColor = "#F57C00");
  suggestBtn.onmouseout = () => (suggestBtn.style.backgroundColor = "#FF9800");
  suggestBtn.onclick = () => {
    // Auto-suggest joint importance values
    const suggestedImportance = suggestJointImportance(motionName);

    // Apply suggestions to sliders
    if (suggestedImportance) {
      // Display notification
      const notification = document.createElement("div");
      notification.style.position = "fixed";
      notification.style.top = "20px";
      notification.style.left = "50%";
      notification.style.transform = "translateX(-50%)";
      notification.style.backgroundColor = "rgba(76, 175, 80, 0.9)";
      notification.style.color = "white";
      notification.style.padding = "10px 20px";
      notification.style.borderRadius = "5px";
      notification.style.zIndex = "10001";
      notification.style.fontWeight = "bold";
      notification.textContent = "Joint importance values auto-suggested!";
      document.body.appendChild(notification);

      // Remove notification after 3 seconds
      setTimeout(() => notification.remove(), 3000);

      // Update all sliders with suggested values
      const sliders = document.querySelectorAll('input[type="range"]');
      sliders.forEach((slider) => {
        const sliderId = slider.getAttribute("data-joint-key");
        if (sliderId && suggestedImportance[sliderId] !== undefined) {
          slider.value = suggestedImportance[sliderId];

          // Also update the display value next to the slider
          const valueDisplay = slider.nextElementSibling;
          if (valueDisplay) {
            valueDisplay.textContent = suggestedImportance[sliderId].toFixed(1);
          }

          // Update the actual joint importance value in the motionRecorder
          motionRecorder.setJointImportance(
            motionName,
            sliderId,
            suggestedImportance[sliderId]
          );
        }
      });

      logDebug(`Auto-suggested joint importance values for ${motionName}`);
    }
  };
  importanceUI.appendChild(suggestBtn);

  // Also add a function to suggest joint importance values
  function suggestJointImportance(motionName) {
    const motionData = motionRecorder.savedMotions.get(motionName);
    if (
      !motionData ||
      !motionData.relativeMotion ||
      motionData.relativeMotion.length === 0
    ) {
      logDebug(`No motion data found for ${motionName}`);
      return null;
    }

    const relativeMotion = motionData.relativeMotion;
    const importance = {};

    // Get joint keys used in this motion
    const jointKeys = motionRecorder.getJointImportanceKeys(motionName);

    // Initialize with base importance
    jointKeys.forEach((key) => {
      importance[key] = 0.5; // Default medium importance
    });

    // Analyze the motion to determine which joints are most active
    const jointActivity = analyzeJointActivity(relativeMotion);

    // Apply importance values based on activity
    for (const [jointKey, activity] of Object.entries(jointActivity)) {
      if (jointKeys.includes(jointKey)) {
        // Convert activity to importance value (0.1 to 1.0)
        // More active joints get higher importance
        const normalizedActivity = Math.min(1.0, Math.max(0.1, activity));
        importance[jointKey] = normalizedActivity;
      }
    }

    return importance;
  }

  // Function to analyze how much each joint contributes to a motion
  function analyzeJointActivity(relativeMotion) {
    const jointActivity = {};

    // First, collect all joint angles and distances used in the motion
    const allJointAngles = new Set();
    const allJointDistances = new Set();

    relativeMotion.forEach((frame) => {
      if (frame.jointAngles) {
        Object.keys(frame.jointAngles).forEach((key) =>
          allJointAngles.add(key)
        );
      }
      if (frame.jointDistances) {
        Object.keys(frame.jointDistances).forEach((key) =>
          allJointDistances.add(key)
        );
      }
    });

    // Initialize activity counters for each joint
    [...allJointAngles].forEach((key) => {
      jointActivity[key] = 0;
    });

    [...allJointDistances].forEach((key) => {
      jointActivity[key] = 0;
    });

    // Analyze changes between frames to determine activity
    for (let i = 1; i < relativeMotion.length; i++) {
      const frame = relativeMotion[i];

      // Analyze angle changes
      if (frame.angleChanges) {
        Object.entries(frame.angleChanges).forEach(([key, change]) => {
          // Add absolute magnitude of change to activity counter
          jointActivity[key] = (jointActivity[key] || 0) + Math.abs(change);
        });
      }

      // Analyze distance changes
      if (frame.distanceChanges) {
        Object.entries(frame.distanceChanges).forEach(([key, change]) => {
          // Add absolute magnitude of change to activity counter
          // We scale distance changes to be comparable to angle changes
          jointActivity[key] =
            (jointActivity[key] || 0) + Math.abs(change) * 10;
        });
      }
    }

    // Normalize activity values to range 0.1 - 1.0
    const maxActivity = Math.max(...Object.values(jointActivity), 0.001);

    Object.keys(jointActivity).forEach((key) => {
      // Scale to 0.1-1.0 range
      let normalizedValue = 0.1 + (jointActivity[key] / maxActivity) * 0.9;

      // Apply sigmoid function to create better distribution
      // This makes more clearly important joints stand out
      normalizedValue = 1 / (1 + Math.exp(-5 * (normalizedValue - 0.5)));

      jointActivity[key] = Math.min(1.0, Math.max(0.1, normalizedValue));
    });

    return jointActivity;
  }

  // Create close button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "15px";
  closeBtn.style.right = "15px";
  closeBtn.style.padding = "8px 15px";
  closeBtn.style.backgroundColor = "#f44336";
  closeBtn.style.color = "white";
  closeBtn.style.border = "none";
  closeBtn.style.borderRadius = "4px";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.fontWeight = "bold";
  closeBtn.style.transition = "background-color 0.2s";
  closeBtn.onmouseover = () => (closeBtn.style.backgroundColor = "#d32f2f");
  closeBtn.onmouseout = () => (closeBtn.style.backgroundColor = "#f44336");
  closeBtn.onclick = () => importanceUI.remove();
  importanceUI.appendChild(closeBtn);

  // Create save button
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save Changes";
  saveBtn.style.position = "absolute";
  saveBtn.style.top = "15px";
  saveBtn.style.right = "100px";
  saveBtn.style.padding = "8px 15px";
  saveBtn.style.backgroundColor = "#4CAF50";
  saveBtn.style.color = "white";
  saveBtn.style.border = "none";
  saveBtn.style.borderRadius = "4px";
  saveBtn.style.cursor = "pointer";
  saveBtn.style.fontWeight = "bold";
  saveBtn.style.transition = "background-color 0.2s";
  saveBtn.onmouseover = () => (saveBtn.style.backgroundColor = "#388E3C");
  saveBtn.onmouseout = () => (saveBtn.style.backgroundColor = "#4CAF50");
  saveBtn.onclick = () => {
    importanceUI.remove();
    logDebug(`Saved joint importance settings for ${motionName}`);
  };
  importanceUI.appendChild(saveBtn);

  // Get joint importance data or initialize if not exists
  let importanceData = motionRecorder.jointImportance.get(motionName);
  if (!importanceData) {
    importanceData =
      motionRecorder.initializeDefaultJointImportance(motionName);
  }

  // Get all joint keys for this motion
  const jointKeys = motionRecorder.getJointImportanceKeys(motionName);

  // Create main content container with two columns
  const contentContainer = document.createElement("div");
  contentContainer.style.display = "flex";
  contentContainer.style.marginTop = "20px";
  contentContainer.style.height = "calc(100% - 80px)";
  importanceUI.appendChild(contentContainer);

  // Left column for the T-pose visualization
  const visualContainer = document.createElement("div");
  visualContainer.style.flex = "1";
  visualContainer.style.minWidth = "300px";
  visualContainer.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
  visualContainer.style.borderRadius = "8px";
  visualContainer.style.padding = "15px";
  visualContainer.style.marginRight = "20px";
  visualContainer.style.display = "flex";
  visualContainer.style.flexDirection = "column";
  visualContainer.style.alignItems = "center";
  contentContainer.appendChild(visualContainer);

  // Add T-pose SVG
  const tposeContainer = document.createElement("div");
  tposeContainer.style.width = "100%";
  tposeContainer.style.height = "500px";
  tposeContainer.style.position = "relative";
  tposeContainer.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 400" width="280" height="500" id="tpose-svg">
      <!-- Head -->
      <circle cx="100" cy="50" r="20" fill="rgba(200, 200, 200, 0.3)" stroke="#DDD" stroke-width="2"/>
      
      <!-- Body -->
      <line x1="100" y1="70" x2="100" y2="200" stroke="#DDD" stroke-width="4" id="torso"/>
      
      <!-- Shoulders -->
      <line x1="60" y1="90" x2="140" y2="90" stroke="#DDD" stroke-width="4" id="shoulders"/>
      
      <!-- Left Arm -->
      <line x1="60" y1="90" x2="30" y2="160" stroke="#DDD" stroke-width="4" id="left-upper-arm"/>
      <line x1="30" y1="160" x2="15" y2="230" stroke="#DDD" stroke-width="4" id="left-forearm"/>
      <circle cx="15" cy="230" r="6" fill="#DDD" id="left-wrist"/>
      
      <!-- Right Arm -->
      <line x1="140" y1="90" x2="170" y2="160" stroke="#DDD" stroke-width="4" id="right-upper-arm"/>
      <line x1="170" y1="160" x2="185" y2="230" stroke="#DDD" stroke-width="4" id="right-forearm"/>
      <circle cx="185" cy="230" r="6" fill="#DDD" id="right-wrist"/>
      
      <!-- Hips -->
      <line x1="70" y1="200" x2="130" y2="200" stroke="#DDD" stroke-width="4" id="hips"/>
      
      <!-- Left Leg -->
      <line x1="70" y1="200" x2="70" y2="290" stroke="#DDD" stroke-width="4" id="left-thigh"/>
      <line x1="70" y1="290" x2="70" y2="370" stroke="#DDD" stroke-width="4" id="left-calf"/>
      <circle cx="70" cy="370" r="6" fill="#DDD" id="left-ankle"/>
      
      <!-- Right Leg -->
      <line x1="130" y1="200" x2="130" y2="290" stroke="#DDD" stroke-width="4" id="right-thigh"/>
      <line x1="130" y1="290" x2="130" y2="370" stroke="#DDD" stroke-width="4" id="right-calf"/>
      <circle cx="130" cy="370" r="6" fill="#DDD" id="right-ankle"/>
      
      <!-- Joints -->
      <circle cx="60" cy="90" r="7" fill="#FF5722" id="left-shoulder-joint"/>
      <circle cx="140" cy="90" r="7" fill="#FF5722" id="right-shoulder-joint"/>
      <circle cx="30" cy="160" r="7" fill="#FF5722" id="left-elbow-joint"/>
      <circle cx="170" cy="160" r="7" fill="#FF5722" id="right-elbow-joint"/>
      <circle cx="70" cy="200" r="7" fill="#FF5722" id="left-hip-joint"/>
      <circle cx="130" cy="200" r="7" fill="#FF5722" id="right-hip-joint"/>
      <circle cx="70" cy="290" r="7" fill="#FF5722" id="left-knee-joint"/>
      <circle cx="130" cy="290" r="7" fill="#FF5722" id="right-knee-joint"/>
    </svg>
    
    <div id="joint-label" style="position: absolute; padding: 5px 10px; background-color: rgba(0,0,0,0.7); color: white; border-radius: 4px; display: none; font-size: 12px; pointer-events: none;"></div>
  `;
  visualContainer.appendChild(tposeContainer);

  // Add visual guide
  const visualGuide = document.createElement("div");
  visualGuide.style.marginTop = "15px";
  visualGuide.style.textAlign = "center";
  visualGuide.style.fontSize = "14px";
  visualGuide.style.color = "#BBBBBB";
  visualGuide.innerHTML =
    "Hover over any slider to highlight the relevant joints";
  visualContainer.appendChild(visualGuide);

  // Right column for sliders
  const slidersContainer = document.createElement("div");
  slidersContainer.style.flex = "1.5";
  slidersContainer.style.overflow = "auto";
  slidersContainer.style.padding = "8px";
  contentContainer.appendChild(slidersContainer);

  // Create category tabs
  const tabsContainer = document.createElement("div");
  tabsContainer.style.display = "flex";
  tabsContainer.style.marginBottom = "15px";
  tabsContainer.style.borderBottom = "1px solid rgba(255, 255, 255, 0.2)";
  slidersContainer.appendChild(tabsContainer);

  const categories = [
    { id: "arms", name: "Arms", color: "#2196F3" },
    { id: "legs", name: "Legs", color: "#FF9800" },
    { id: "torso", name: "Torso", color: "#9C27B0" },
  ];

  const categoryContainers = {};

  categories.forEach((category, index) => {
    // Create tab button
    const tab = document.createElement("div");
    tab.textContent = category.name;
    tab.style.padding = "10px 20px";
    tab.style.cursor = "pointer";
    tab.style.borderBottom =
      index === 0 ? `3px solid ${category.color}` : "3px solid transparent";
    tab.style.fontWeight = "bold";
    tab.style.transition = "all 0.2s";
    tabsContainer.appendChild(tab);

    // Create container for this category (initially hidden except first one)
    const container = document.createElement("div");
    container.id = `category-${category.id}`;
    container.style.display = index === 0 ? "grid" : "none";
    container.style.gridTemplateColumns =
      "repeat(auto-fill, minmax(350px, 1fr))";
    container.style.gap = "15px";
    container.style.marginBottom = "15px";
    slidersContainer.appendChild(container);

    categoryContainers[category.id] = container;

    // Tab click handler
    tab.onclick = () => {
      // Reset all tabs
      tabsContainer.childNodes.forEach((t) => {
        t.style.borderBottom = "3px solid transparent";
      });

      // Hide all containers
      Object.values(categoryContainers).forEach((c) => {
        c.style.display = "none";
      });

      // Activate this tab and container
      tab.style.borderBottom = `3px solid ${category.color}`;
      container.style.display = "grid";
    };
  });

  // Map to store joint visualization IDs
  const jointVisualizationMap = {
    // Angle mappings
    angle_23_24_23_25: ["left-hip-joint", "left-thigh"], // Left Hip Angle
    angle_24_23_24_26: ["right-hip-joint", "right-thigh"], // Right Hip Angle
    angle_23_25_25_27: ["left-knee-joint", "left-thigh", "left-calf"], // Left Knee Angle
    angle_24_26_26_28: ["right-knee-joint", "right-thigh", "right-calf"], // Right Knee Angle
    angle_11_12_11_13: ["left-shoulder-joint", "left-upper-arm"], // Left Shoulder Angle
    angle_12_11_12_14: ["right-shoulder-joint", "right-upper-arm"], // Right Shoulder Angle
    angle_11_13_13_15: ["left-elbow-joint", "left-upper-arm", "left-forearm"], // Left Elbow Angle
    angle_12_14_14_16: [
      "right-elbow-joint",
      "right-upper-arm",
      "right-forearm",
    ], // Right Elbow Angle
    angle_11_12_23_24: ["torso", "shoulders", "hips"], // Torso Orientation

    // Distance mappings
    dist_24_26: ["right-hip-joint", "right-knee-joint", "right-thigh"], // Right Hip-Knee
    dist_26_28: ["right-knee-joint", "right-ankle", "right-calf"], // Right Knee-Ankle
    dist_23_25: ["left-hip-joint", "left-knee-joint", "left-thigh"], // Left Hip-Knee
    dist_25_27: ["left-knee-joint", "left-ankle", "left-calf"], // Left Knee-Ankle
    dist_12_14: [
      "right-shoulder-joint",
      "right-elbow-joint",
      "right-upper-arm",
    ], // Right Shoulder-Elbow
    dist_14_16: ["right-elbow-joint", "right-wrist", "right-forearm"], // Right Elbow-Wrist
    dist_11_13: ["left-shoulder-joint", "left-elbow-joint", "left-upper-arm"], // Left Shoulder-Elbow
    dist_13_15: ["left-elbow-joint", "left-wrist", "left-forearm"], // Left Elbow-Wrist
    dist_11_12: ["left-shoulder-joint", "right-shoulder-joint", "shoulders"], // Shoulders Width
    dist_23_24: ["left-hip-joint", "right-hip-joint", "hips"], // Hips Width
    dist_11_23: ["left-shoulder-joint", "left-hip-joint", "torso"], // Left Torso Length
    dist_12_24: ["right-shoulder-joint", "right-hip-joint", "torso"], // Right Torso Length
  };

  // Get original joint names
  const jointNames = {
    angle_23_24_23_25: "Left Hip Angle",
    angle_24_23_24_26: "Right Hip Angle",
    angle_23_25_25_27: "Left Knee Angle",
    angle_24_26_26_28: "Right Knee Angle",
    angle_11_12_11_13: "Left Shoulder Angle",
    angle_12_11_12_14: "Right Shoulder Angle",
    angle_11_13_13_15: "Left Elbow Angle",
    angle_12_14_14_16: "Right Elbow Angle",
    angle_11_12_23_24: "Torso Orientation",
  };

  // Map for friendly distance names
  const distanceNames = {
    dist_24_26: "Right Hip-Knee",
    dist_26_28: "Right Knee-Ankle",
    dist_23_25: "Left Hip-Knee",
    dist_25_27: "Left Knee-Ankle",
    dist_12_14: "Right Shoulder-Elbow",
    dist_14_16: "Right Elbow-Wrist",
    dist_11_13: "Left Shoulder-Elbow",
    dist_13_15: "Left Elbow-Wrist",
    dist_11_12: "Shoulders Width",
    dist_23_24: "Hips Width",
    dist_11_23: "Left Torso Length",
    dist_12_24: "Right Torso Length",
  };

  // Categorization of joints
  const categoryMap = {
    arms: [
      "angle_11_12_11_13",
      "angle_12_11_12_14",
      "angle_11_13_13_15",
      "angle_12_14_14_16",
      "dist_12_14",
      "dist_14_16",
      "dist_11_13",
      "dist_13_15",
      "dist_11_12",
    ],
    legs: [
      "angle_23_24_23_25",
      "angle_24_23_24_26",
      "angle_23_25_25_27",
      "angle_24_26_26_28",
      "dist_24_26",
      "dist_26_28",
      "dist_23_25",
      "dist_25_27",
      "dist_23_24",
    ],
    torso: ["angle_11_12_23_24", "dist_11_23", "dist_12_24"],
  };

  // Helper function to create a slider
  function createSlider(key, category, isAngle = true) {
    const sliderContainer = document.createElement("div");
    sliderContainer.classList.add("slider-container");
    sliderContainer.style.backgroundColor = "rgba(30, 30, 40, 0.8)";
    sliderContainer.style.padding = "15px";
    sliderContainer.style.borderRadius = "8px";
    sliderContainer.style.border = "1px solid rgba(255, 255, 255, 0.1)";
    sliderContainer.style.transition = "transform 0.1s, box-shadow 0.1s";

    // Get label based on type
    const label = isAngle ? jointNames[key] : distanceNames[key];
    const displayName = document.createElement("div");
    displayName.classList.add("slider-label");
    displayName.textContent = label;
    displayName.style.marginBottom = "10px";
    displayName.style.fontWeight = "bold";
    displayName.style.color = isAngle ? "#81D4FA" : "#FFCC80";
    sliderContainer.appendChild(displayName);

    // Add icon to indicate joint type
    const iconType = document.createElement("span");
    iconType.style.fontSize = "12px";
    iconType.style.backgroundColor = isAngle
      ? "rgba(33, 150, 243, 0.3)"
      : "rgba(255, 152, 0, 0.3)";
    iconType.style.padding = "3px 6px";
    iconType.style.borderRadius = "4px";
    iconType.style.marginLeft = "8px";
    iconType.textContent = isAngle ? "Angle" : "Distance";
    displayName.appendChild(iconType);

    // Create slider row with value display
    const sliderRow = document.createElement("div");
    sliderRow.style.display = "flex";
    sliderRow.style.alignItems = "center";
    sliderContainer.appendChild(sliderRow);

    // Create slider
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "1";
    slider.step = "0.1";
    slider.setAttribute("data-joint-key", key);
    slider.value =
      importanceData[key] !== undefined ? importanceData[key] : 1.0;
    slider.style.flex = "1";
    slider.style.height = "12px";
    slider.style.accentColor = isAngle ? "#2196F3" : "#FF9800";
    sliderRow.appendChild(slider);

    // Create value display
    const valueDisplay = document.createElement("span");
    valueDisplay.textContent = slider.value;
    valueDisplay.style.marginLeft = "15px";
    valueDisplay.style.fontWeight = "bold";
    valueDisplay.style.fontSize = "16px";
    valueDisplay.style.color = isAngle ? "#2196F3" : "#FF9800";
    valueDisplay.style.width = "30px";
    valueDisplay.style.textAlign = "center";
    sliderRow.appendChild(valueDisplay);

    // Add event listeners
    slider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      valueDisplay.textContent = value.toFixed(1);
      motionRecorder.setJointImportance(motionName, key, value);
    });

    // Add hover effects to highlight joints in the visualization
    sliderContainer.addEventListener("mouseenter", () => {
      // Highlight relevant joints in the SVG
      const elementsToHighlight = jointVisualizationMap[key] || [];
      const jointColor = isAngle ? "#2196F3" : "#FF9800";

      elementsToHighlight.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
          if (element.tagName === "circle") {
            element.setAttribute("fill", jointColor);
            element.setAttribute("r", "9"); // Make joint bigger
          } else {
            element.setAttribute("stroke", jointColor);
            element.setAttribute("stroke-width", "6");
          }
        }
      });

      // Show label
      const jointLabel = document.getElementById("joint-label");
      if (jointLabel) {
        jointLabel.textContent = label;
        jointLabel.style.backgroundColor = isAngle
          ? "rgba(33, 150, 243, 0.8)"
          : "rgba(255, 152, 0, 0.8)";
        jointLabel.style.display = "block";
        jointLabel.style.left = "140px";
        jointLabel.style.top = isAngle ? "60px" : "30px";
      }

      // Style this slider
      sliderContainer.style.transform = "translateY(-2px)";
      sliderContainer.style.boxShadow = `0 4px 10px rgba(${
        isAngle ? "33, 150, 243" : "255, 152, 0"
      }, 0.4)`;
      sliderContainer.style.borderColor = isAngle
        ? "rgba(33, 150, 243, 0.5)"
        : "rgba(255, 152, 0, 0.5)";
    });

    sliderContainer.addEventListener("mouseleave", () => {
      // Reset highlights
      const elementsToHighlight = jointVisualizationMap[key] || [];

      elementsToHighlight.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
          if (element.tagName === "circle") {
            // Check if it's a joint circle or wrist/ankle
            if (id.includes("joint")) {
              element.setAttribute("fill", "#FF5722");
              element.setAttribute("r", "7");
            } else {
              element.setAttribute("fill", "#DDD");
              element.setAttribute("r", "6");
            }
          } else {
            element.setAttribute("stroke", "#DDD");
            element.setAttribute("stroke-width", "4");
          }
        }
      });

      // Hide label
      const jointLabel = document.getElementById("joint-label");
      if (jointLabel) {
        jointLabel.style.display = "none";
      }

      // Reset slider style
      sliderContainer.style.transform = "translateY(0)";
      sliderContainer.style.boxShadow = "none";
      sliderContainer.style.borderColor = "rgba(255, 255, 255, 0.1)";
    });

    return sliderContainer;
  }

  // Filter for angle joints and add them to appropriate categories
  const angleJoints = jointKeys.filter((key) => key.startsWith("angle_"));
  angleJoints.forEach((key) => {
    // Determine which category this joint belongs to
    let category = "torso"; // Default
    for (const [cat, keys] of Object.entries(categoryMap)) {
      if (keys.includes(key)) {
        category = cat;
        break;
      }
    }

    // Add to the right category container
    if (categoryContainers[category]) {
      categoryContainers[category].appendChild(
        createSlider(key, category, true)
      );
    }
  });

  // Filter for distance joints
  const distanceJoints = jointKeys.filter((key) => key.startsWith("dist_"));
  distanceJoints.forEach((key) => {
    // Determine which category this joint belongs to
    let category = "torso"; // Default
    for (const [cat, keys] of Object.entries(categoryMap)) {
      if (keys.includes(key)) {
        category = cat;
        break;
      }
    }

    // Add to the right category container
    if (categoryContainers[category]) {
      categoryContainers[category].appendChild(
        createSlider(key, category, false)
      );
    }
  });

  // Add to document body
  document.body.appendChild(importanceUI);

  return importanceUI;
}

// Make the function available globally for MotionRecorder to use
window.createJointImportanceUI = createJointImportanceUI;

// Start the camera
camera.start();

console.log(
  "Motion detection system initialized - hold left trigger to detect motions"
);
logDebug("Location-independent motion tracking active - try moving around!");
