class MotionRecorder {
  constructor() {
    this.isRecording = false;
    this.currentMotionName = null;
    this.recordedSequence = [];
    this.savedMotions = new Map();
    this.isPlaying = false;
    this.playbackSequence = null;
    this.currentPlaybackFrame = 0;
    this.lastDrawnFrame = null;
    this.recordingStartTime = null;
    this.jointImportance = new Map();

    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenContext = this.offscreenCanvas.getContext("2d");

    // Recording buffer while trigger is held
    this.triggerBuffer = [];
    this.isTriggerHeld = false;
    this.triggerHoldStartTime = null;

    // For motion detection
    this.recentFrames = [];
    this.lastDetectedMotion = null;
    this.lastDetectionTime = 0;

    // Debugging flags
    this.DEBUG = true;
    this.debugContainer = null;
    this.createDebugUI(); //this shit is so shit i can't smell it

    // Configuration
    this.FRAME_RATE = 30;
    this.lastFrameTime = 0;

    // Motion matching configuration
    this.SEQUENCE_MATCH_THRESHOLD = 0.5; // Lowered threshold to account for natural variation
    this.MIN_SEQUENCE_LENGTH = 5; // Minimum frames to consider a valid motion
    this.MIN_MOTION_DURATION = 200; // Minimum duration in ms
    this.MIN_MOVEMENT_MAGNITUDE = 0.02; // Minimum movement to consider
    this.MOTION_COOLDOWN = 1000; // Cooldown between detections
    this.motionKeyMappings = new Map(); // Store motion name -> key mapping
    this.activeHeldKeys = new Set(); // Track keys being held
    this.toggledKeys = new Set(); // Track keys that are toggled on

    // Key joints to track for motion detection
    this.KEY_JOINTS = [
      11,
      12, // shoulders
      13,
      14, // elbows
      15,
      16, // wrists
      23,
      24, // hips
      25,
      26, // knees
      27,
      28, // ankles
    ];

    this.DURATION_MATCH_WEIGHT = 0.35; // How much motion duration affects matching
    this.DURATION_TOLERANCE = 0.4; // Maximum allowed duration difference (as percentage)
    this.MOTION_PHASES = 3; // Beginning, middle, end phases for better temporal analysis
    this.NOISE_THRESHOLD = 0.003; // Filter out tiny movements as noise
    this.KEY_PHASE_WEIGHT = 1.8; // Give more weight to the "key phase" of a motion

    // Key joint pairs for relative movement tracking
    this.JOINT_PAIRS = [
      [24, 26], // Right hip to right knee
      [26, 28], // Right knee to right ankle
      [23, 25], // Left hip to left knee
      [25, 27], // Left knee to left ankle
      [12, 14], // Right shoulder to right elbow
      [14, 16], // Right elbow to right wrist
      [11, 13], // Left shoulder to left elbow
      [13, 15], // Left elbow to left wrist
      [11, 12], // Left shoulder to right shoulder
      [23, 24], // Left hip to right hip
      [11, 23], // Left shoulder to left hip
      [12, 24], // Right shoulder to right hip
    ];

    // Create shared UIAPI
    window.MotionUIAPI = {
      setMatchThreshold: (threshold) => {
        const oldThreshold = this.SEQUENCE_MATCH_THRESHOLD;
        this.SEQUENCE_MATCH_THRESHOLD = Math.max(0.1, Math.min(0.9, threshold));
        this.logDebug(
          `Match threshold changed from ${oldThreshold} to ${this.SEQUENCE_MATCH_THRESHOLD}`
        );
        return this.SEQUENCE_MATCH_THRESHOLD;
      },
      getMatchThreshold: () => this.SEQUENCE_MATCH_THRESHOLD,
      setMotionCooldown: (ms) => {
        const oldCooldown = this.MOTION_COOLDOWN;
        this.MOTION_COOLDOWN = Math.max(500, Math.min(5000, ms));
        this.logDebug(
          `Motion cooldown changed from ${oldCooldown}ms to ${this.MOTION_COOLDOWN}ms`
        );
        return this.MOTION_COOLDOWN;
      },
      getMotionCooldown: () => this.MOTION_COOLDOWN,
    };
  }

  getJointImportance(motionName, jointKey) {
    const motionImportance = this.jointImportance.get(motionName);
    if (!motionImportance) return 1.0;
    return jointKey in motionImportance &&
      motionImportance[jointKey] !== undefined
      ? motionImportance[jointKey]
      : 1.0;
  }

  setJointImportance(motionName, jointKey, value) {
    if (!this.jointImportance.has(motionName)) {
      this.jointImportance.set(motionName, {});
    }

    const motionImportance = this.jointImportance.get(motionName);
    motionImportance[jointKey] = Math.max(0, Math.min(1, value)); // Clamp between 0-1

    this.logDebug(
      `Set joint importance for ${motionName}, ${jointKey}: ${value}`
    );
    return motionImportance[jointKey];
  }

  initializeDefaultJointImportance(motionName) {
    const defaultImportance = {};

    // Add angle keys
    if (
      this.savedMotions.has(motionName) &&
      this.savedMotions.get(motionName).relativeMotion?.length > 0
    ) {
      const relativeMotion = this.savedMotions.get(motionName).relativeMotion;

      // Use the first frame with angle data to get the keys
      for (const frame of relativeMotion) {
        if (frame.jointAngles) {
          Object.keys(frame.jointAngles).forEach((key) => {
            defaultImportance[key] = 1.0;
          });
          break;
        }
      }

      // Use the first frame with distance data to get the keys
      for (const frame of relativeMotion) {
        if (frame.jointDistances) {
          Object.keys(frame.jointDistances).forEach((key) => {
            defaultImportance[key] = 1.0;
          });
          break;
        }
      }
    }

    this.jointImportance.set(motionName, defaultImportance);
    return defaultImportance;
  }

  getJointImportanceKeys(motionName) {
    // Get all jointAngle and jointDistance keys from the motion data
    const keys = [];

    if (
      this.savedMotions.has(motionName) &&
      this.savedMotions.get(motionName).relativeMotion?.length > 0
    ) {
      const relativeMotion = this.savedMotions.get(motionName).relativeMotion;

      // Find the first frame with joint angle data
      for (const frame of relativeMotion) {
        if (frame.jointAngles) {
          keys.push(...Object.keys(frame.jointAngles));
          break;
        }
      }

      // Find the first frame with joint distance data
      for (const frame of relativeMotion) {
        if (frame.jointDistances) {
          keys.push(...Object.keys(frame.jointDistances));
          break;
        }
      }
    }

    return [...new Set(keys)]; // Return unique keys
  }

  // Create debug UI panel
  createDebugUI() {
    if (!this.DEBUG) return;

    // Check if it already exists
    if (document.getElementById("motion-debug-panel")) {
      this.debugContainer = document.getElementById("motion-debug-panel");
      return;
    }

    this.debugContainer = document.createElement("div");
    this.debugContainer.id = "motion-debug-panel";
    this.debugContainer.style.position = "fixed";
    this.debugContainer.style.left = "10px";
    this.debugContainer.style.top = "10px";
    this.debugContainer.style.width = "400px";
    this.debugContainer.style.maxHeight = "300px";
    this.debugContainer.style.overflowY = "auto";
    this.debugContainer.style.backgroundColor = "rgba(0,0,0,0.7)";
    this.debugContainer.style.color = "white";
    this.debugContainer.style.padding = "10px";
    this.debugContainer.style.borderRadius = "5px";
    this.debugContainer.style.fontFamily = "monospace";
    this.debugContainer.style.fontSize = "12px";
    this.debugContainer.style.zIndex = "9999";
    this.debugContainer.innerHTML = "<h3>Motion Debugging</h3>";

    // Add controls
    const controls = document.createElement("div");
    controls.style.marginBottom = "10px";

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear Log";
    clearBtn.style.marginRight = "5px";
    clearBtn.onclick = () => this.clearDebugLog();

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "Toggle Debug";
    toggleBtn.onclick = () => this.toggleDebug();

    controls.appendChild(clearBtn);
    controls.appendChild(toggleBtn);
    this.debugContainer.appendChild(controls);

    // Add log container
    const logContainer = document.createElement("div");
    logContainer.id = "motion-debug-log";
    this.debugContainer.appendChild(logContainer);

    document.body.appendChild(this.debugContainer);

    this.logDebug("Debug panel initialized");
  }

  clearDebugLog() {
    if (!this.DEBUG || !this.debugContainer) return;
    const logContainer = this.debugContainer.querySelector("#motion-debug-log");
    if (logContainer) {
      logContainer.innerHTML = "";
    }
    this.logDebug("Log cleared");
  }

  toggleDebug() {
    this.DEBUG = !this.DEBUG;
    if (this.debugContainer) {
      this.debugContainer.style.display = this.DEBUG ? "block" : "none";
    }
  }

  logDebug(message, data = null) {
    if (!this.DEBUG) return;

    console.log(`[MotionRecorder] ${message}`, data || "");

    if (!this.debugContainer) this.createDebugUI();

    const logContainer = this.debugContainer.querySelector("#motion-debug-log");
    if (!logContainer) return;

    const entry = document.createElement("div");
    entry.className = "debug-entry";
    entry.style.borderBottom = "1px solid #444";
    entry.style.paddingBottom = "3px";
    entry.style.marginBottom = "3px";

    const timestamp = new Date().toLocaleTimeString();
    entry.innerHTML = `<span style="color:#aaa">[${timestamp}]</span> ${message}`;

    if (data) {
      const details = document.createElement("pre");
      details.style.fontSize = "10px";
      details.style.maxHeight = "60px";
      details.style.overflow = "auto";
      details.style.backgroundColor = "#222";
      details.style.padding = "3px";
      details.style.borderRadius = "3px";
      details.style.marginTop = "3px";

      if (typeof data === "object") {
        try {
          details.textContent = JSON.stringify(data, null, 2);
        } catch (e) {
          details.textContent = "Error stringifying object";
        }
      } else {
        details.textContent = data;
      }

      entry.appendChild(details);
    }

    // Add to top of log for newest-first ordering
    if (logContainer.firstChild) {
      logContainer.insertBefore(entry, logContainer.firstChild);
    } else {
      logContainer.appendChild(entry);
    }

    // Limit entries
    const entries = logContainer.querySelectorAll(".debug-entry");
    if (entries.length > 30) {
      for (let i = 30; i < entries.length; i++) {
        entries[i].remove();
      }
    }
  }

  startRecording(motionName) {
    if (!motionName) return;
    this.isRecording = true;
    this.recordedSequence = [];
    this.currentMotionName = motionName;
    this.lastFrameTime = 0;
    this.recordingStartTime = Date.now();
    this.logDebug(`Started recording motion: ${motionName}`);
  }

  stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;

    if (this.recordedSequence.length === 0) {
      this.logDebug("No frames recorded", { warning: true });
      return;
    }

    // Normalize timestamps relative to start time
    const normalizedSequence = this.recordedSequence.map((frame) => ({
      ...frame,
      timestamp: frame.timestamp - this.recordingStartTime,
    }));

    // Calculate relative motion data for the sequence
    const relativeMotionData =
      this.calculateRelativeMotionData(normalizedSequence);

    // Calculate motion metrics for validation
    const motionMetrics = this.calculateMotionMetrics(normalizedSequence);
    this.logDebug("Motion metrics calculated", motionMetrics);

    // Store the motion with its metrics and relative data
    this.savedMotions.set(this.currentMotionName, {
      sequence: normalizedSequence,
      metrics: motionMetrics,
      relativeMotion: relativeMotionData,
    });

    // Initialize default joint importance values
    this.initializeDefaultJointImportance(this.currentMotionName);

    this.logDebug(
      `Saved motion "${this.currentMotionName}" with ${normalizedSequence.length} frames`,
      {
        metrics: motionMetrics,
      }
    );

    this.currentMotionName = null;
    this.recordedSequence = [];
    this.lastFrameTime = 0;
    this.recordingStartTime = null;
  }

  // Calculate metrics for a motion sequence
  calculateMotionMetrics(sequence) {
    if (sequence.length < 2) return { duration: 0, maxDisplacement: 0 };

    const duration =
      sequence[sequence.length - 1].timestamp - sequence[0].timestamp;

    // Calculate maximum displacement for key joints
    let maxDisplacement = 0;
    let maxJointIdx = -1;
    let jointDisplacements = {};

    for (const jointIdx of this.KEY_JOINTS) {
      let jointMaxDisplacement = 0;

      for (let i = 1; i < sequence.length; i++) {
        const prevPos = sequence[i - 1].pose[jointIdx];
        const currPos = sequence[i].pose[jointIdx];

        const displacement = Math.sqrt(
          Math.pow(currPos.x - prevPos.x, 2) +
            Math.pow(currPos.y - prevPos.y, 2) +
            Math.pow(currPos.z - prevPos.z, 2)
        );

        jointMaxDisplacement = Math.max(jointMaxDisplacement, displacement);
      }

      jointDisplacements[`joint${jointIdx}`] = jointMaxDisplacement;

      if (jointMaxDisplacement > maxDisplacement) {
        maxDisplacement = jointMaxDisplacement;
        maxJointIdx = jointIdx;
      }
    }

    const metrics = {
      duration: duration,
      maxDisplacement: maxDisplacement,
      maxJointIdx: maxJointIdx,
      jointDisplacements: jointDisplacements,
      totalFrames: sequence.length,
      averageSpeed: maxDisplacement / (duration / 1000), // units per second
    };

    return metrics;
  }

  // New method to calculate relative motion data
  calculateRelativeMotionData(sequence) {
    if (sequence.length < 2) return [];

    const relativeData = [];

    for (let i = 0; i < sequence.length; i++) {
      const frame = sequence[i];
      const frameRelative = {
        timestamp: frame.timestamp,
        jointAngles: this.calculateJointAngles(frame.pose),
        jointDistances: this.calculateJointDistances(frame.pose),
        centerOfMass: this.calculateCenterOfMass(frame.pose),
      };
      relativeData.push(frameRelative);
    }

    // Add movement vectors between frames
    for (let i = 1; i < relativeData.length; i++) {
      const prevFrame = relativeData[i - 1];
      const currFrame = relativeData[i];

      // Calculate joint angle changes
      const angleChanges = {};
      Object.keys(currFrame.jointAngles).forEach((key) => {
        angleChanges[key] = this.calculateAngleDifference(
          prevFrame.jointAngles[key],
          currFrame.jointAngles[key]
        );
      });

      // Calculate joint distance changes
      const distanceChanges = {};
      Object.keys(currFrame.jointDistances).forEach((key) => {
        distanceChanges[key] =
          currFrame.jointDistances[key] - prevFrame.jointDistances[key];
      });

      relativeData[i].angleChanges = angleChanges;
      relativeData[i].distanceChanges = distanceChanges;
    }

    return relativeData;
  }

  // Calculate the center of mass (using torso as reference)
  calculateCenterOfMass(pose) {
    // Use the center point between hips as reference
    const leftHip = pose[23];
    const rightHip = pose[24];

    return {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
      z: (leftHip.z + rightHip.z) / 2,
    };
  }

  // Calculate angles between key joint pairs
  calculateJointAngles(pose) {
    const angles = {};

    // Angle pairs to calculate
    const anglePairs = [
      // Leg angles
      [
        [23, 24],
        [23, 25],
      ], // Left hip angle (hip line to left upper leg)
      [
        [24, 23],
        [24, 26],
      ], // Right hip angle (hip line to right upper leg)
      [
        [23, 25],
        [25, 27],
      ], // Left knee angle
      [
        [24, 26],
        [26, 28],
      ], // Right knee angle

      // Arm angles
      [
        [11, 12],
        [11, 13],
      ], // Left shoulder angle (shoulder line to left upper arm)
      [
        [12, 11],
        [12, 14],
      ], // Right shoulder angle (shoulder line to right upper arm)
      [
        [11, 13],
        [13, 15],
      ], // Left elbow angle
      [
        [12, 14],
        [14, 16],
      ], // Right elbow angle

      // Torso angles
      [
        [11, 12],
        [23, 24],
      ], // Shoulders to hips (torso orientation)
    ];

    anglePairs.forEach((pair, idx) => {
      const [[p1, p2], [p3, p4]] = pair;

      // Vector 1
      const v1 = {
        x: pose[p2].x - pose[p1].x,
        y: pose[p2].y - pose[p1].y,
        z: pose[p2].z - pose[p1].z,
      };

      // Vector 2
      const v2 = {
        x: pose[p4].x - pose[p3].x,
        y: pose[p4].y - pose[p3].y,
        z: pose[p4].z - pose[p3].z,
      };

      const angle = this.calculateAngleBetweenVectors(v1, v2);
      angles[`angle_${p1}_${p2}_${p3}_${p4}`] = angle;
    });

    return angles;
  }

  // Calculate angle between two 3D vectors (in radians)
  calculateAngleBetweenVectors(v1, v2) {
    // Compute dot product
    const dotProduct = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;

    // Compute magnitudes
    const v1Mag = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
    const v2Mag = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

    // Avoid division by zero
    if (v1Mag === 0 || v2Mag === 0) return 0;

    // Compute angle using dot product formula
    const cosAngle = dotProduct / (v1Mag * v2Mag);

    // Clamp value to valid range for Math.acos
    const clampedCosAngle = Math.max(-1, Math.min(1, cosAngle));

    return Math.acos(clampedCosAngle);
  }

  // Calculate the difference between two angles accounting for wraparound
  calculateAngleDifference(angle1, angle2) {
    let diff = angle2 - angle1;
    // Normalize to range [-π, π]
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  }

  // Calculate distances between key joint pairs
  calculateJointDistances(pose) {
    const distances = {};

    this.JOINT_PAIRS.forEach(([j1, j2]) => {
      const p1 = pose[j1];
      const p2 = pose[j2];

      const distance = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) +
          Math.pow(p2.y - p1.y, 2) +
          Math.pow(p2.z - p1.z, 2)
      );

      distances[`dist_${j1}_${j2}`] = distance;
    });

    return distances;
  }

  recordFrame(poseLandmarks, controllerData) {
    const currentTime = Date.now();

    // If officially recording a new motion (via R key or record button)
    if (this.isRecording) {
      const timeSinceLastFrame = currentTime - this.lastFrameTime;
      if (timeSinceLastFrame < 1000 / this.FRAME_RATE) return;

      const normalizedPose = poseLandmarks.map((landmark) => ({
        x: landmark.x,
        y: landmark.y,
        z: landmark.z || 0,
        visibility: landmark.visibility || 1.0,
      }));

      this.recordedSequence.push({
        timestamp: currentTime,
        pose: normalizedPose,
        controller: this.normalizeControllerData(controllerData),
      });

      this.lastFrameTime = currentTime;

      if (this.recordedSequence.length % 10 === 0) {
        this.logDebug(
          `Recording: ${this.recordedSequence.length} frames captured`
        );
      }
    }

    // Handle trigger buffer for motion detection
    // Check if left trigger is held down
    const leftTriggerValue =
      controllerData?.leftController?.buttons?.trigger || 0;
    const leftTriggerThreshold = 0.5;

    // If trigger just pressed now, start a new buffer
    if (leftTriggerValue >= leftTriggerThreshold && !this.isTriggerHeld) {
      this.isTriggerHeld = true;
      this.triggerHoldStartTime = currentTime;
      this.triggerBuffer = [];
      this.logDebug("Left trigger pressed - starting motion capture");
    }

    // If trigger is being held, add frames to buffer
    if (this.isTriggerHeld) {
      const normalizedPose = poseLandmarks.map((landmark) => ({
        x: landmark.x,
        y: landmark.y,
        z: landmark.z || 0,
        visibility: landmark.visibility || 1.0,
      }));

      this.triggerBuffer.push({
        timestamp: currentTime,
        pose: normalizedPose,
        controller: this.normalizeControllerData(controllerData),
      });

      // Periodically log buffer size
      if (this.triggerBuffer.length % 30 === 0) {
        this.logDebug(
          `Trigger held: ${this.triggerBuffer.length} frames in buffer`
        );
      }
    }

    // If trigger just released now, process the buffer
    if (leftTriggerValue < leftTriggerThreshold && this.isTriggerHeld) {
      this.isTriggerHeld = false;
      this.logDebug(
        `Left trigger released - analyzing ${this.triggerBuffer.length} frames`
      );

      // Process the motion if we have enough frames
      if (this.triggerBuffer.length >= this.MIN_SEQUENCE_LENGTH) {
        this.processMotionSequence(this.triggerBuffer);
      } else {
        this.logDebug("Not enough frames for motion detection");
      }

      // Clear the buffer
      this.triggerBuffer = [];
    }
  }

  normalizeControllerData(controllerData) {
    if (!controllerData) return null;

    const normalizeButton = (value) => Math.min(Math.max(value || 0, 0), 1);

    return {
      rightController: controllerData.rightController
        ? {
            buttons: {
              trigger: normalizeButton(
                controllerData.rightController.buttons?.trigger
              ),
              grip: normalizeButton(
                controllerData.rightController.buttons?.grip
              ),
              A: normalizeButton(controllerData.rightController.buttons?.A),
              B: normalizeButton(controllerData.rightController.buttons?.B),
            },
          }
        : null,
      leftController: controllerData.leftController
        ? {
            buttons: {
              trigger: normalizeButton(
                controllerData.leftController.buttons?.trigger
              ),
              grip: normalizeButton(
                controllerData.leftController.buttons?.grip
              ),
              X: normalizeButton(controllerData.leftController.buttons?.X),
              Y: normalizeButton(controllerData.leftController.buttons?.Y),
            },
          }
        : null,
    };
  }

  setMotionKeyMapping(motionName, keyConfig) {
    this.motionKeyMappings.set(motionName, keyConfig);
    this.logDebug(
      `Mapped motion "${motionName}" to key: ${JSON.stringify(keyConfig)}`
    );
    return true;
  }

  // Get a specific motion-to-key mapping
  getMotionKeyMapping(motionName) {
    return this.motionKeyMappings.get(motionName);
  }

  // Get all motion-to-key mappings
  getAllMotionKeyMappings() {
    return Array.from(this.motionKeyMappings.entries()).map(
      ([motionName, keyConfig]) => ({
        motion: motionName,
        keyConfig,
      })
    );
  }

  // Remove a motion-to-key mapping
  removeMotionKeyMapping(motionName) {
    const result = this.motionKeyMappings.delete(motionName);
    if (result) {
      this.logDebug(`Removed key mapping for motion: ${motionName}`);
    }
    return result;
  }

  // Execute a key mapping when a motion is detected
  executeKeyMapping(motionName) {
    const keyConfig = this.motionKeyMappings.get(motionName);
    if (!keyConfig) {
      this.logDebug(`No key mapping found for motion: ${motionName}`);
      return false;
    }

    this.logDebug(
      `Executing key mapping for motion "${motionName}": ${JSON.stringify(
        keyConfig
      )}`
    );

    // Release all held keys if this is a new motion with "hold" behavior
    if (keyConfig.behavior === "hold") {
      this.releaseAllHeldKeys();
    }

    // Handle different key behaviors
    switch (keyConfig.behavior) {
      case "press_release":
        // Send key press and release events
        this.sendKeyCommand(keyConfig.key, "press");
        setTimeout(() => {
          this.sendKeyCommand(keyConfig.key, "release");
        }, 100); // Short delay to simulate key press
        break;

      case "hold":
        // Send key press and track it
        this.sendKeyCommand(keyConfig.key, "press");
        this.activeHeldKeys.add(keyConfig.key);
        break;

      case "toggle":
        // Toggle key state
        if (this.toggledKeys.has(keyConfig.key)) {
          // Key is toggled on, turn it off
          this.sendKeyCommand(keyConfig.key, "release");
          this.toggledKeys.delete(keyConfig.key);
        } else {
          // Key is off, toggle it on
          this.sendKeyCommand(keyConfig.key, "press");
          this.toggledKeys.add(keyConfig.key);
        }
        break;

      default:
        this.logDebug(`Unknown key behavior: ${keyConfig.behavior}`);
        return false;
    }

    return true;
  }

  // Release all held keys
  releaseAllHeldKeys() {
    this.activeHeldKeys.forEach((key) => {
      this.sendKeyCommand(key, "release");
    });
    this.activeHeldKeys.clear();
  }

  // Send a key command to the server via WebSocket
  sendKeyCommand(key, action) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      this.logDebug("WebSocket not connected, can't send key command");
      return false;
    }

    // Format special keys and modifiers
    const keyParts = key.toLowerCase().split("+");
    const mainKey = keyParts.pop(); // Last part is the main key
    const modifiers = keyParts; // Everything else is modifiers

    const message = {
      type: "motion_key_command",
      key: mainKey,
      modifiers: modifiers,
      action: action, // "press" or "release"
    };

    try {
      ws.send(JSON.stringify(message));
      this.logDebug(`Sent key command: ${action} ${key}`);
      return true;
    } catch (error) {
      this.logDebug(`Error sending key command: ${error.message}`);
      return false;
    }
  }

  // Export mappings to JSON
  exportKeyMappings() {
    const mappings = this.getAllMotionKeyMappings();
    return JSON.stringify(mappings, null, 2);
  }

  // Import mappings from JSON
  importKeyMappings(jsonData) {
    try {
      const mappings = JSON.parse(jsonData);
      let importCount = 0;

      mappings.forEach((mapping) => {
        if (mapping.motion && mapping.keyConfig && mapping.keyConfig.key) {
          this.setMotionKeyMapping(mapping.motion, mapping.keyConfig);
          importCount++;
        }
      });

      this.logDebug(`Imported ${importCount} key mappings`);
      return importCount;
    } catch (error) {
      this.logDebug(`Error importing key mappings: ${error.message}`);
      return 0;
    }
  }

  // Also save key mappings along with motion data
  exportMotion(motionName) {
    const motionData = this.savedMotions.get(motionName);
    if (!motionData) {
      this.logDebug(`Cannot export: No motion data for ${motionName}`);
      return;
    }

    // Get joint importance data
    const importance = this.jointImportance.get(motionName) || {};

    // Get key mapping data if available
    const keyMapping = this.motionKeyMappings.get(motionName);

    // Create a downloadable JSON file with importance and key mapping included
    const exportData = {
      sequence: motionData.sequence,
      metrics: motionData.metrics,
      relativeMotion: motionData.relativeMotion,
      importance: importance,
      keyMapping: keyMapping, // Include key mapping in export
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `motion_${motionName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.logDebug(`Exported motion: ${motionName}`);
  }

  // Update import to handle key mappings
  importMotion(jsonData, motionName) {
    try {
      const motionData = JSON.parse(jsonData);
      if (!motionData.sequence || !motionData.metrics) {
        this.logDebug("Invalid motion data format");
        return false;
      }

      // For older motion data without relative motion data, calculate it
      if (!motionData.relativeMotion && motionData.sequence.length > 0) {
        motionData.relativeMotion = this.calculateRelativeMotionData(
          motionData.sequence
        );
        this.logDebug("Added relative motion data to imported motion");
      }

      // Save motion data
      this.savedMotions.set(motionName, motionData);

      // Import joint importance if available, otherwise initialize defaults
      if (motionData.importance) {
        this.jointImportance.set(motionName, motionData.importance);
        this.logDebug("Imported joint importance data");
      } else {
        this.initializeDefaultJointImportance(motionName);
        this.logDebug("Initialized default joint importance (none in import)");
      }

      // Import key mapping if available
      if (motionData.keyMapping) {
        this.motionKeyMappings.set(motionName, motionData.keyMapping);
        this.logDebug(
          `Imported key mapping: ${JSON.stringify(motionData.keyMapping)}`
        );
      }

      this.logDebug(`Imported motion: ${motionName}`, {
        frames: motionData.sequence.length,
        metrics: motionData.metrics,
      });
      return true;
    } catch (e) {
      this.logDebug(`Error importing motion: ${e.message}`);
      return false;
    }
  }

  // Process a motion sequence after trigger release
  processMotionSequence(sequence) {
    const currentTime = Date.now();

    // Check for cooldown period
    if (currentTime - this.lastDetectionTime < this.MOTION_COOLDOWN) {
      this.logDebug("In cooldown period, skipping motion detection");
      return null;
    }

    // Check if we have saved motions to compare against
    if (this.savedMotions.size === 0) {
      this.logDebug("No saved motions to compare against");
      return null;
    }

    // Normalize the sequence relative to its start time
    const startTime = sequence[0].timestamp;
    const normalizedSequence = sequence.map((frame) => ({
      ...frame,
      timestamp: frame.timestamp - startTime,
    }));

    // Calculate relative motion data for this sequence
    const relativeMotionData =
      this.calculateRelativeMotionData(normalizedSequence);

    // Calculate metrics for this sequence
    const metrics = this.calculateMotionMetrics(normalizedSequence);
    this.logDebug("Motion metrics for trigger sequence", metrics);

    // Check if there's enough movement to consider it a real motion
    if (metrics.maxDisplacement < this.MIN_MOVEMENT_MAGNITUDE) {
      this.logDebug("Not enough movement in sequence", {
        maxDisplacement: metrics.maxDisplacement,
        threshold: this.MIN_MOVEMENT_MAGNITUDE,
      });
      return null;
    }

    // Check if the motion happened over a reasonable time
    if (metrics.duration < this.MIN_MOTION_DURATION) {
      this.logDebug("Motion too short", {
        duration: metrics.duration,
        threshold: this.MIN_MOTION_DURATION,
      });
      return null;
    }

    // Match against all saved motions
    let bestMatch = null;
    let bestMatchScore = 0;
    let bestMatchDetail = null;

    // Store all matches above a minimum threshold for debugging
    const allMatches = [];

    for (const [motionName, motionData] of this.savedMotions.entries()) {
      const {
        sequence: savedSequence,
        metrics: savedMetrics,
        relativeMotion: savedRelativeMotion,
      } = motionData;

      this.logDebug(`Comparing against motion: ${motionName}`, {
        savedFrames: savedSequence.length,
        currentFrames: normalizedSequence.length,
        savedDuration: savedMetrics.duration,
        currentDuration: metrics.duration,
      });

      // Calculate how similar this motion is to the saved one using relative motion data
      const matchResult = this.compareRelativeMotions(
        relativeMotionData,
        savedRelativeMotion,
        motionName
      );

      this.logDebug(`Match result for ${motionName}`, matchResult);

      // Store all significant matches for debugging
      if (matchResult.score > 0.3) {
        allMatches.push({
          name: motionName,
          ...matchResult,
        });
      }

      // Calculate dynamic threshold based on motion duration
      let threshold = this.SEQUENCE_MATCH_THRESHOLD;

      // For very short motions, require higher confidence
      if (metrics.duration < 500 || savedMetrics.duration < 500) {
        threshold = Math.min(0.6, threshold + 0.1);
      }

      // For very long motions, can be slightly more forgiving
      if (metrics.duration > 2000 && savedMetrics.duration > 2000) {
        threshold = Math.max(0.4, threshold - 0.05);
      }

      if (
        matchResult.score > bestMatchScore &&
        matchResult.score >= threshold
      ) {
        bestMatch = motionName;
        bestMatchScore = matchResult.score;
        bestMatchDetail = matchResult;
      }
    }

    if (bestMatch) {
      this.lastDetectionTime = currentTime;
      this.lastDetectedMotion = bestMatch;

      this.executeKeyMapping(bestMatch);
      this.logDebug(
        `MOTION DETECTED: ${bestMatch} (score: ${bestMatchScore.toFixed(2)})`,
        {
          timestamp: new Date(currentTime).toLocaleTimeString(),
          detail: bestMatchDetail,
          allMatches: allMatches.sort((a, b) => b.score - a.score),
        }
      );

      return bestMatch;
    } else {
      this.logDebug("No motion matched with sufficient confidence", {
        bestMatches: allMatches.sort((a, b) => b.score - a.score).slice(0, 3),
      });
      return null;
    }
  }

  calculatePhaseImportance(relativeMotion) {
    if (!relativeMotion || relativeMotion.length < 3) {
      return Array(relativeMotion?.length || 0).fill(1.0);
    }

    const phaseImportance = Array(relativeMotion.length).fill(1.0);
    const sampleCount = relativeMotion.length;

    // Detect the key phase of motion by finding where the most movement happens
    let maxMovementPhase = 0;
    let maxMovementMagnitude = 0;

    // First, calculate movement magnitudes for each frame transition
    const movementMagnitudes = Array(sampleCount - 1).fill(0);

    for (let i = 1; i < sampleCount; i++) {
      const prevFrame = relativeMotion[i - 1];
      const currFrame = relativeMotion[i];
      let totalMagnitude = 0;
      let measureCount = 0;

      // Sum up angle changes
      if (currFrame.angleChanges) {
        Object.keys(currFrame.angleChanges).forEach((key) => {
          totalMagnitude += Math.abs(currFrame.angleChanges[key]);
          measureCount++;
        });
      }

      // Add in distance changes
      if (currFrame.distanceChanges) {
        Object.keys(currFrame.distanceChanges).forEach((key) => {
          // Normalize distance changes to be comparable to angle changes
          totalMagnitude += Math.abs(currFrame.distanceChanges[key]) * 10;
          measureCount++;
        });
      }

      // Calculate average magnitude per measure
      movementMagnitudes[i - 1] =
        measureCount > 0 ? totalMagnitude / measureCount : 0;

      // Track maximum movement phase
      if (movementMagnitudes[i - 1] > maxMovementMagnitude) {
        maxMovementMagnitude = movementMagnitudes[i - 1];
        maxMovementPhase = i - 1;
      }
    }

    // Filter out noise
    for (let i = 0; i < movementMagnitudes.length; i++) {
      if (movementMagnitudes[i] < this.NOISE_THRESHOLD) {
        movementMagnitudes[i] = 0;
      }
    }

    // Apply smoothing to the movement magnitudes
    const smoothedMagnitudes = this.smoothArray(movementMagnitudes, 3);

    // Find the most significant continuous movement phase
    let phaseStart = 0;
    let phaseEnd = 0;
    let currentPhaseStart = 0;
    let currentSum = 0;
    let maxSum = 0;

    for (let i = 0; i < smoothedMagnitudes.length; i++) {
      if (smoothedMagnitudes[i] > this.NOISE_THRESHOLD) {
        // Continue or start phase
        if (currentSum === 0) {
          currentPhaseStart = i;
        }
        currentSum += smoothedMagnitudes[i];
      } else if (currentSum > 0) {
        // End of phase
        if (currentSum > maxSum) {
          maxSum = currentSum;
          phaseStart = currentPhaseStart;
          phaseEnd = i - 1;
        }
        currentSum = 0;
      }
    }

    // Check if the last phase was the biggest
    if (currentSum > maxSum) {
      maxSum = currentSum;
      phaseStart = currentPhaseStart;
      phaseEnd = smoothedMagnitudes.length - 1;
    }

    // If we couldn't find a significant phase, use the maximum movement point
    if (maxSum === 0) {
      phaseStart = Math.max(0, maxMovementPhase - 1);
      phaseEnd = Math.min(sampleCount - 2, maxMovementPhase + 1);
    }

    // Apply higher weights to the key phase
    for (let i = phaseStart; i <= phaseEnd; i++) {
      phaseImportance[i] = this.KEY_PHASE_WEIGHT;
      // Also apply to the next frame to ensure the result of the movement is captured
      if (i + 1 < phaseImportance.length) {
        phaseImportance[i + 1] = this.KEY_PHASE_WEIGHT;
      }
    }

    return phaseImportance;
  }

  // Helper method to smooth an array using a sliding window
  smoothArray(array, windowSize) {
    if (!array || array.length <= windowSize) {
      return array;
    }

    const result = [...array];
    const halfWindow = Math.floor(windowSize / 2);

    for (let i = halfWindow; i < array.length - halfWindow; i++) {
      let sum = 0;
      for (let j = i - halfWindow; j <= i + halfWindow; j++) {
        sum += array[j];
      }
      result[i] = sum / windowSize;
    }

    return result;
  }

  compareRelativeMotions(
    currentRelativeMotion,
    savedRelativeMotion,
    motionName
  ) {
    if (
      !currentRelativeMotion ||
      !savedRelativeMotion ||
      currentRelativeMotion.length < 2 ||
      savedRelativeMotion.length < 2
    ) {
      return { score: 0 };
    }

    // Calculate duration matching score
    const currentDuration =
      currentRelativeMotion[currentRelativeMotion.length - 1].timestamp -
      currentRelativeMotion[0].timestamp;
    const savedDuration =
      savedRelativeMotion[savedRelativeMotion.length - 1].timestamp -
      savedRelativeMotion[0].timestamp;

    // Duration difference as a percentage of the longer duration
    const maxDuration = Math.max(currentDuration, savedDuration);
    const durationDiff =
      Math.abs(currentDuration - savedDuration) / maxDuration;

    // If duration difference exceeds tolerance, penalize heavily
    let durationScore = 1.0;
    if (durationDiff > this.DURATION_TOLERANCE) {
      durationScore = Math.max(
        0.2, // Set a minimum score of 0.2 instead of 0, and for what?
        1 -
          Math.sqrt(
            (durationDiff - this.DURATION_TOLERANCE) /
              (1 - this.DURATION_TOLERANCE)
          )
      );

      // For very large differences, return early with a low score
      if (durationDiff > 0.7 && maxDuration > 500) {
        this.logDebug(
          `Duration mismatch: ${currentDuration}ms vs ${savedDuration}ms`
        );
        return {
          score: 0.3 * durationScore,
          durationDiff: durationDiff,
          currentDuration,
          savedDuration,
        };
      }
    }

    // Calculate phase importance for both motions
    const currentPhaseImportance = this.calculatePhaseImportance(
      currentRelativeMotion
    );
    const savedPhaseImportance =
      this.calculatePhaseImportance(savedRelativeMotion);

    // Resample to have same number of frames for comparison
    const sampleCount = Math.min(
      20,
      Math.min(currentRelativeMotion.length, savedRelativeMotion.length)
    );
    const currentSampled = this.resampleRelativeMotion(
      currentRelativeMotion,
      sampleCount
    );
    const savedSampled = this.resampleRelativeMotion(
      savedRelativeMotion,
      sampleCount
    );

    // Resample phase importance arrays to match new sample count
    const currentPhaseImportanceResampled = this.resampleArray(
      currentPhaseImportance,
      currentRelativeMotion.length,
      sampleCount
    );
    const savedPhaseImportanceResampled = this.resampleArray(
      savedPhaseImportance,
      savedRelativeMotion.length,
      sampleCount
    );

    // Track component-wise similarity scores
    const angleScores = [];
    const distanceChangeScores = [];

    // Get joint importance for this motion
    const jointImportance = this.jointImportance.get(motionName) || {};

    // Compare joint angles at each sampled point
    for (let i = 1; i < sampleCount; i++) {
      // Start from 1 to focus on changes
      const currentFrame = currentSampled[i];
      const savedFrame = savedSampled[i];

      // Phase weight for this frame (combine both motions' phase importance)
      const phaseWeight =
        (currentPhaseImportanceResampled[i] +
          savedPhaseImportanceResampled[i]) /
        2;

      // Compare angle changes (most important for motion recognition)
      let angleChangeScore = 0;
      let angleCount = 0;

      if (currentFrame.angleChanges && savedFrame.angleChanges) {
        const angleKeys = Object.keys(currentFrame.angleChanges);

        for (const key of angleKeys) {
          if (savedFrame.angleChanges[key] !== undefined) {
            // Calculate how similar the angle changes are (1.0 = identical)
            const angleDiff = Math.abs(
              currentFrame.angleChanges[key] - savedFrame.angleChanges[key]
            );

            // More adaptive threshold for angles based on movement magnitude
            const angleMagnitude = Math.max(
              Math.abs(currentFrame.angleChanges[key]),
              Math.abs(savedFrame.angleChanges[key])
            );

            let threshold = Math.PI / 2; // Even more lenient (previously PI/2.5)
            if (angleMagnitude > 0.5) {
              threshold = Math.PI / 3; // More lenient (previously PI/3.5)
            } else if (angleMagnitude < 0.1) {
              threshold = Math.PI / 1.3; // More lenient (previously PI/1.5)
            }
            const similarity = Math.max(0, 1 - angleDiff / threshold);

            // Apply importance weighting - use stored importance if available
            const importance = jointImportance[key] || 0.5;
            angleChangeScore += similarity * importance * phaseWeight;
            angleCount += importance * phaseWeight;
          }
        }
      }

      if (angleCount > 0) {
        angleScores.push(angleChangeScore / angleCount);
      }

      // Compare distance changes
      let distanceChangeScore = 0;
      let distanceCount = 0;

      if (currentFrame.distanceChanges && savedFrame.distanceChanges) {
        const distKeys = Object.keys(currentFrame.distanceChanges);

        for (const key of distKeys) {
          if (savedFrame.distanceChanges[key] !== undefined) {
            // For distance changes, we care about the sign (direction) matching
            // and the relative magnitude
            const currentChange = currentFrame.distanceChanges[key];
            const savedChange = savedFrame.distanceChanges[key];

            // Check if direction matches (extending vs contracting)
            const sameDirection =
              (currentChange >= 0 && savedChange >= 0) ||
              (currentChange <= 0 && savedChange <= 0);

            // Calculate magnitude similarity
            let magnitudeSimilarity = 0;
            if (sameDirection) {
              if (Math.abs(savedChange) < 0.01) {
                // For very small changes, direction matching is enough
                magnitudeSimilarity = 1.0;
              } else {
                const maxMagnitude = Math.max(
                  Math.abs(currentChange),
                  Math.abs(savedChange)
                );
                if (maxMagnitude > 0.001) {
                  // Avoid division by near-zero
                  // Adaptive comparison based on magnitude
                  const ratio =
                    Math.min(Math.abs(currentChange), Math.abs(savedChange)) /
                    maxMagnitude;

                  // For larger movements, be more strict about matching magnitude
                  if (maxMagnitude > 0.1) {
                    magnitudeSimilarity = Math.pow(ratio, 0.75);
                  } else {
                    // For smaller movements, be more forgiving with sqrt transformation
                    magnitudeSimilarity = Math.sqrt(ratio);
                  }
                } else {
                  magnitudeSimilarity = 1.0; // Both changes are tiny, consider them similar
                }
              }
            }

            // Weight direction match higher than magnitude
            const similarity = sameDirection
              ? 0.8 + 0.2 * magnitudeSimilarity
              : 0;

            // Apply importance weighting using stored importance
            const importance = jointImportance[key] || 0.5;
            distanceChangeScore += similarity * importance * phaseWeight;
            distanceCount += importance * phaseWeight;
          }
        }
      }

      if (distanceCount > 0) {
        distanceChangeScores.push(distanceChangeScore / distanceCount);
      }
    }

    // Calculate final scores
    const avgAngleScore =
      angleScores.length > 0
        ? angleScores.reduce((sum, score) => sum + score, 0) /
          angleScores.length
        : 0;

    const avgDistanceScore =
      distanceChangeScores.length > 0
        ? distanceChangeScores.reduce((sum, score) => sum + score, 0) /
          distanceChangeScores.length
        : 0;

    // Apply boost and duration penalty
    const boostFactor = Math.max(avgAngleScore, avgDistanceScore);
    const boost = boostFactor > 0.6 ? (boostFactor - 0.6) * 0.5 : 0;

    // Weight angle changes more heavily than distance changes
    let weightedScore = avgAngleScore * 0.75 + avgDistanceScore * 0.25 + boost;
    if (avgAngleScore > 0.8 && avgDistanceScore > 0.6) {
      // Extra boost for very similar motions
      weightedScore = Math.min(1.0, weightedScore * 1.15);
    }

    // Apply duration penalty
    weightedScore =
      weightedScore * (1 - this.DURATION_MATCH_WEIGHT) +
      durationScore * this.DURATION_MATCH_WEIGHT;

    // Ensure score is between 0 and 1
    weightedScore = Math.max(0, Math.min(1, weightedScore));

    return {
      score: weightedScore,
      angleScore: avgAngleScore,
      distanceScore: avgDistanceScore,
      durationScore: durationScore,
      currentDuration,
      savedDuration,
    };
  }

  resampleArray(array, originalLength, newLength) {
    if (!array || originalLength <= 1 || newLength <= 1) {
      return Array(newLength).fill(array ? array[0] : 1.0);
    }

    const result = new Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const position = (i / (newLength - 1)) * (originalLength - 1);
      const index = Math.floor(position);
      const fraction = position - index;

      if (index + 1 < originalLength) {
        // Linear interpolation
        result[i] = array[index] * (1 - fraction) + array[index + 1] * fraction;
      } else {
        result[i] = array[index];
      }
    }

    return result;
  }

  // Resample relative motion data to have consistent samples
  resampleRelativeMotion(motionData, sampleCount) {
    if (motionData.length <= 1) return motionData;
    if (motionData.length === sampleCount) return motionData;

    // Apply light smoothing to reduce noise before resampling
    const smoothedData = this.smoothMotionData(motionData);

    const result = [];
    const totalDuration =
      smoothedData[smoothedData.length - 1].timestamp -
      smoothedData[0].timestamp;

    for (let i = 0; i < sampleCount; i++) {
      const targetTime =
        motionData[0].timestamp + (totalDuration * i) / (sampleCount - 1);

      // Find surrounding points
      let beforeIdx = 0;
      let afterIdx = 0;

      for (let j = 0; j < smoothedData.length - 1; j++) {
        if (
          smoothedData[j].timestamp <= targetTime &&
          smoothedData[j + 1].timestamp >= targetTime
        ) {
          beforeIdx = j;
          afterIdx = j + 1;
          break;
        }
      }

      // Interpolate between the surrounding points
      const beforePoint = smoothedData[beforeIdx];
      const afterPoint = smoothedData[afterIdx];

      // Handle edge case if timestamps are the same
      if (afterPoint.timestamp === beforePoint.timestamp) {
        result.push({ ...beforePoint, timestamp: targetTime });
        continue;
      }

      const ratio =
        (targetTime - beforePoint.timestamp) /
        (afterPoint.timestamp - beforePoint.timestamp);

      // Interpolate joint angles
      const interpolatedAngles = {};
      if (beforePoint.jointAngles && afterPoint.jointAngles) {
        Object.keys(beforePoint.jointAngles).forEach((key) => {
          if (afterPoint.jointAngles[key] !== undefined) {
            // For angles, we need to interpolate with care for wraparound
            const angle1 = beforePoint.jointAngles[key];
            const angle2 = afterPoint.jointAngles[key];
            interpolatedAngles[key] = this.interpolateAngle(
              angle1,
              angle2,
              ratio
            );
          }
        });
      }

      // Interpolate distances
      const interpolatedDistances = {};
      if (beforePoint.jointDistances && afterPoint.jointDistances) {
        Object.keys(beforePoint.jointDistances).forEach((key) => {
          if (afterPoint.jointDistances[key] !== undefined) {
            const dist1 = beforePoint.jointDistances[key];
            const dist2 = afterPoint.jointDistances[key];
            interpolatedDistances[key] = dist1 + (dist2 - dist1) * ratio;
          }
        });
      }

      // Interpolate angle changes
      const interpolatedAngleChanges = {};
      if (beforePoint.angleChanges && afterPoint.angleChanges) {
        Object.keys(beforePoint.angleChanges).forEach((key) => {
          if (afterPoint.angleChanges[key] !== undefined) {
            const change1 = beforePoint.angleChanges[key];
            const change2 = afterPoint.angleChanges[key];
            interpolatedAngleChanges[key] = this.interpolateAngle(
              change1,
              change2,
              ratio
            );
          }
        });
      }

      // Interpolate distance changes
      const interpolatedDistChanges = {};
      if (beforePoint.distanceChanges && afterPoint.distanceChanges) {
        Object.keys(beforePoint.distanceChanges).forEach((key) => {
          if (afterPoint.distanceChanges[key] !== undefined) {
            const change1 = beforePoint.distanceChanges[key];
            const change2 = afterPoint.distanceChanges[key];
            interpolatedDistChanges[key] =
              change1 + (change2 - change1) * ratio;
          }
        });
      }

      // Create interpolated point
      const interpolated = {
        timestamp: targetTime,
        jointAngles: interpolatedAngles,
        jointDistances: interpolatedDistances,
        angleChanges: interpolatedAngleChanges,
        distanceChanges: interpolatedDistChanges,
      };

      result.push(interpolated);
    }

    return result;
  }

  // Apply a simple moving average smoothing to motion data
  smoothMotionData(motionData) {
    if (motionData.length <= 2) return motionData;

    const smoothed = [];

    // Keep first frame unchanged
    smoothed.push({ ...motionData[0] });

    // Smooth middle frames with a 3-point moving average
    for (let i = 1; i < motionData.length - 1; i++) {
      const prevFrame = motionData[i - 1];
      const currFrame = motionData[i];
      const nextFrame = motionData[i + 1];

      // Start with a copy of the current frame
      const smoothedFrame = {
        timestamp: currFrame.timestamp,
        jointAngles: {},
        jointDistances: {},
        centerOfMass: { ...currFrame.centerOfMass },
      };

      // Smooth joint angles (if they exist)
      if (currFrame.jointAngles) {
        Object.keys(currFrame.jointAngles).forEach((key) => {
          if (
            prevFrame.jointAngles &&
            nextFrame.jointAngles &&
            prevFrame.jointAngles[key] !== undefined &&
            nextFrame.jointAngles[key] !== undefined
          ) {
            // Apply weighted average (current frame has double weight)
            const avg =
              (prevFrame.jointAngles[key] +
                3 * currFrame.jointAngles[key] +
                nextFrame.jointAngles[key]) /
              5;

            smoothedFrame.jointAngles[key] = avg;
          } else {
            smoothedFrame.jointAngles[key] = currFrame.jointAngles[key];
          }
        });
      }

      // Smooth joint distances
      if (currFrame.jointDistances) {
        Object.keys(currFrame.jointDistances).forEach((key) => {
          if (
            prevFrame.jointDistances &&
            nextFrame.jointDistances &&
            prevFrame.jointDistances[key] !== undefined &&
            nextFrame.jointDistances[key] !== undefined
          ) {
            // Apply weighted average
            const avg =
              (prevFrame.jointDistances[key] +
                2 * currFrame.jointDistances[key] +
                nextFrame.jointDistances[key]) /
              4;
            smoothedFrame.jointDistances[key] = avg;
          } else {
            smoothedFrame.jointDistances[key] = currFrame.jointDistances[key];
          }
        });
      }

      // Copy angle changes and distance changes if they exist
      if (currFrame.angleChanges) {
        smoothedFrame.angleChanges = { ...currFrame.angleChanges };
      }

      if (currFrame.distanceChanges) {
        smoothedFrame.distanceChanges = { ...currFrame.distanceChanges };
      }

      smoothed.push(smoothedFrame);
    }

    // Keep last frame unchanged
    smoothed.push({ ...motionData[motionData.length - 1] });

    // Recalculate angle and distance changes for the smoothed data
    for (let i = 1; i < smoothed.length; i++) {
      const prevFrame = smoothed[i - 1];
      const currFrame = smoothed[i];

      // Calculate angle changes
      const angleChanges = {};
      if (prevFrame.jointAngles && currFrame.jointAngles) {
        Object.keys(currFrame.jointAngles).forEach((key) => {
          if (prevFrame.jointAngles[key] !== undefined) {
            angleChanges[key] = this.calculateAngleDifference(
              prevFrame.jointAngles[key],
              currFrame.jointAngles[key]
            );
          }
        });
      }

      // Calculate distance changes
      const distanceChanges = {};
      if (prevFrame.jointDistances && currFrame.jointDistances) {
        Object.keys(currFrame.jointDistances).forEach((key) => {
          if (prevFrame.jointDistances[key] !== undefined) {
            distanceChanges[key] =
              currFrame.jointDistances[key] - prevFrame.jointDistances[key];
          }
        });
      }

      smoothed[i].angleChanges = angleChanges;
      smoothed[i].distanceChanges = distanceChanges;
    }

    return smoothed;
  }

  // Interpolate between two angles, accounting for wraparound
  interpolateAngle(angle1, angle2, ratio) {
    // Handle angle wraparound for smooth interpolation
    let diff = angle2 - angle1;

    // Normalize to [-π, π] range to find shortest arc
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    let result = angle1 + diff * ratio;

    // Normalize result to [0, 2π] range
    while (result < 0) result += 2 * Math.PI;
    while (result >= 2 * Math.PI) result -= 2 * Math.PI;

    return result;
  }

  // Modified version to check for motions when trigger is held
  checkForMotions(currentPoseLandmarks, currentControllerData) {
    // This is the old method - we now use the processMotionSequence after trigger release
    // But we need to maintain this API for compatibility with existing code

    // We still record frames while the trigger is held
    const leftTriggerValue =
      currentControllerData?.leftController?.buttons?.trigger || 0;
    const leftTriggerThreshold = 0.5;

    // If trigger is held, record frame and return any recently detected motion
    if (leftTriggerValue >= leftTriggerThreshold) {
      return this.lastDetectedMotion;
    }

    return null;
  }

  startPlayback(motionName) {
    const motionData = this.savedMotions.get(motionName);
    if (
      !motionData ||
      !motionData.sequence ||
      motionData.sequence.length === 0
    ) {
      this.logDebug(`No recorded motion found with name: ${motionName}`);
      return;
    }

    this.isPlaying = true;
    this.playbackSequence = motionData.sequence;
    this.currentPlaybackFrame = 0;
    this.playbackStartTime = Date.now();
    this.currentMotionName = motionName; // Store the motion name for importance visualization
    this.logDebug(`Started playback: ${motionName}`, {
      frameCount: this.playbackSequence.length,
    });

    // Initialize offscreen canvas dimensions
    if (canvasElement) {
      this.offscreenCanvas.width = canvasElement.width;
      this.offscreenCanvas.height = canvasElement.height;
    }

    this.playbackNextFrame();
  }

  stopPlayback() {
    this.isPlaying = false;
    this.playbackSequence = null;
    this.currentPlaybackFrame = 0;
    this.playbackStartTime = null;
    this.lastDrawnFrame = null;
    this.currentMotionName = null; // Clear the motion name
    if (canvasCtx) {
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }
    this.logDebug("Stopped playback");
  }

  playbackNextFrame() {
    if (!this.isPlaying || !this.playbackSequence) return;

    const frame = this.playbackSequence[this.currentPlaybackFrame];
    this.drawPlaybackFrame(frame);
    this.currentPlaybackFrame++;

    if (this.currentPlaybackFrame >= this.playbackSequence.length) {
      this.stopPlayback();
      return;
    }

    const nextFrame = this.playbackSequence[this.currentPlaybackFrame];
    const frameDelay = nextFrame.timestamp - frame.timestamp;

    requestAnimationFrame(() => {
      setTimeout(() => this.playbackNextFrame(), frameDelay);
    });
  }

  drawSkeletonWithImportance(pose, motionName, ctx = canvasCtx) {
    if (!ctx) return;

    if (!motionName) {
      // Fall back to regular drawing if no motion name is provided
      return this.drawSkeleton(pose, ctx);
    }

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
      [28, 32], // Right leg
    ];

    ctx.save();

    // Get all joint importance keys for this motion
    const importanceKeys = this.getJointImportanceKeys(motionName);

    // Draw each limb with color/width based on importance
    for (const [start, end] of limbs) {
      // Find all importance keys that affect this limb
      const relevantKeys = [];

      for (const key of importanceKeys) {
        // For angle keys, check if this limb forms one of the vectors
        if (key.startsWith("angle_")) {
          // Split the key: angle_a_b_c_d
          const parts = key.split("_");
          if (parts.length === 5) {
            const a = parseInt(parts[1], 10);
            const b = parseInt(parts[2], 10);
            const c = parseInt(parts[3], 10);
            const d = parseInt(parts[4], 10);

            // Check if this limb forms either the first or second vector
            if (
              (a === start && b === end) ||
              (a === end && b === start) ||
              (c === start && d === end) ||
              (c === end && d === start)
            ) {
              relevantKeys.push(key);
            }
          }
        }
        // For distance keys, check if they directly match this limb
        else if (key.startsWith("dist_")) {
          const parts = key.split("_");
          if (parts.length === 3) {
            const a = parseInt(parts[1], 10);
            const b = parseInt(parts[2], 10);

            if ((a === start && b === end) || (a === end && b === start)) {
              relevantKeys.push(key);
            }
          }
        }
      }

      // Calculate average importance for this limb
      let totalImportance = 0;
      let count = 0;

      for (const key of relevantKeys) {
        const importance = this.getJointImportance(motionName, key);
        totalImportance += importance;
        count++;
      }

      // Default to full importance if no joints affect this limb
      const avgImportance = count > 0 ? totalImportance / count : 1.0;

      // Set visual properties based on importance
      const alpha = 0.3 + avgImportance * 0.7; // Range from 0.3-1.0 transparency
      const lineWidth = 3 + avgImportance * 5; // Range from 3-8px width

      // Generate color based on importance threshold
      // High importance (>0.8): Green
      // Medium importance (0.4-0.8): Yellow
      // Low importance (<0.4): Red
      let r, g, b;
      if (avgImportance > 0.8) {
        // Green for high importance
        r = 0;
        g = 255;
        b = 0;
      } else if (avgImportance >= 0.4) {
        // Yellow for medium importance
        r = 255;
        g = 255;
        b = 0;
      } else {
        // Red for low importance
        r = 255;
        g = 0;
        b = 0;
      }

      // Draw the limb
      ctx.beginPath();
      ctx.moveTo(
        pose[start].x * canvasElement.width,
        pose[start].y * canvasElement.height
      );
      ctx.lineTo(
        pose[end].x * canvasElement.width,
        pose[end].y * canvasElement.height
      );
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      // Draw a circle at each joint
      const jointRadius = 3 + avgImportance * 4; // Range from 3-7px radius

      // Draw start joint
      ctx.beginPath();
      ctx.arc(
        pose[start].x * canvasElement.width,
        pose[start].y * canvasElement.height,
        jointRadius,
        0,
        2 * Math.PI
      );
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.fill();

      // Draw end joint
      ctx.beginPath();
      ctx.arc(
        pose[end].x * canvasElement.width,
        pose[end].y * canvasElement.height,
        jointRadius,
        0,
        2 * Math.PI
      );
      ctx.fill();
    }

    // Add a legend to explain the importance visualization
    const legendX = 10;
    const legendY = canvasElement.height - 60;

    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(legendX, legendY, 180, 50);

    ctx.fillStyle = "white";
    ctx.font = "12px Arial";
    ctx.fillText("Joint Importance:", legendX + 10, legendY + 20);

    // Draw importance scale with three color categories
    const categories = [
      { label: "Low (<0.4)", color: [255, 0, 0] },
      { label: "Med (0.4-0.8)", color: [255, 255, 0] },
      { label: "High (>0.8)", color: [0, 255, 0] },
    ];

    for (let i = 0; i < 3; i++) {
      const [r, g, b] = categories[i].color;
      const alpha = 0.9; // Consistent alpha for the legend

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.fillRect(legendX + 10 + i * 55, legendY + 30, 45, 10);

      ctx.fillStyle = "white";
      ctx.font = "10px Arial";
      ctx.fillText(categories[i].label, legendX + 10 + i * 55, legendY + 45);
    }

    ctx.restore();
  }

  // Modified: Updated to support drawing to different contexts
  drawSkeleton(pose, ctx = canvasCtx) {
    if (!ctx) return;

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
      [28, 32], // Right leg
    ];

    ctx.save();

    for (const [start, end] of limbs) {
      ctx.beginPath();
      ctx.moveTo(
        pose[start].x * canvasElement.width,
        pose[start].y * canvasElement.height
      );
      ctx.lineTo(
        pose[end].x * canvasElement.width,
        pose[end].y * canvasElement.height
      );
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 5;
      ctx.stroke();
    }

    ctx.restore();
  }

  drawSkeleton(pose, ctx = canvasCtx) {
    if (!ctx) return;

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
      [28, 32], // Right leg
    ];

    ctx.save();

    for (const [start, end] of limbs) {
      ctx.beginPath();
      ctx.moveTo(
        pose[start].x * canvasElement.width,
        pose[start].y * canvasElement.height
      );
      ctx.lineTo(
        pose[end].x * canvasElement.width,
        pose[end].y * canvasElement.height
      );
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 5;
      ctx.stroke();
    }

    ctx.restore();
  }

  drawPlaybackFrame(frame) {
    if (!frame || !frame.pose || !canvasCtx) return;

    // Update offscreen canvas dimensions if needed
    const width = canvasElement.width;
    const height = canvasElement.height;

    if (
      this.offscreenCanvas.width !== width ||
      this.offscreenCanvas.height !== height
    ) {
      this.offscreenCanvas.width = width;
      this.offscreenCanvas.height = height;
    }

    // Clear the offscreen canvas
    this.offscreenContext.clearRect(0, 0, width, height);

    // Draw to the offscreen canvas using joint importance visualization
    this.drawSkeletonWithImportance(
      frame.pose,
      this.currentMotionName,
      this.offscreenContext
    );

    if (frame.controller) {
      this.drawControllerState(frame.controller, this.offscreenContext);
    }

    //for flickering sh*t
    this.offscreenContext.fillStyle = "rgba(0, 0, 0, 0.3)";
    this.offscreenContext.fillRect(0, 0, width, height);

    this.drawSkeletonWithImportance(
      frame.pose,
      this.currentMotionName,
      this.offscreenContext
    );

    // Copy from offscreen canvas to visible canvas in a single operation
    // This prevents the white flickering by avoiding partial renders
    canvasCtx.clearRect(0, 0, width, height);
    canvasCtx.drawImage(this.offscreenCanvas, 0, 0);

    this.lastDrawnFrame = frame;
  }

  drawControllerState(controllerData, ctx = canvasCtx) {
    if (!ctx) return;

    const padding = 20;
    const fontSize = 16;

    ctx.save();
    ctx.fillStyle = "#de34eb";
    ctx.font = `${fontSize}px Arial`;

    let y = padding + fontSize;

    const drawControllerInfo = (controller, prefix) => {
      if (!controller?.buttons) return;

      Object.entries(controller.buttons).forEach(([button, value]) => {
        ctx.fillText(`${prefix} ${button}: ${value.toFixed(2)}`, padding, y);
        y += fontSize + 5;
      });
    };

    drawControllerInfo(controllerData.rightController, "Right");
    drawControllerInfo(controllerData.leftController, "Left");

    ctx.restore();
  }

  // Visualization and export methods
  visualizeMotion(motionName) {
    const motionData = this.savedMotions.get(motionName);
    if (!motionData || !motionData.sequence) {
      this.logDebug(`No motion data found for: ${motionName}`);
      return;
    }

    // Create visualization modal
    const modal = document.createElement("div");
    modal.style.position = "fixed";
    modal.style.top = "50%";
    modal.style.left = "50%";
    modal.style.transform = "translate(-50%, -50%)";
    modal.style.width = "80%";
    modal.style.maxWidth = "800px";
    modal.style.maxHeight = "80%";
    modal.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
    modal.style.padding = "20px";
    modal.style.borderRadius = "10px";
    modal.style.zIndex = "10000";
    modal.style.color = "white";
    modal.style.fontFamily = "monospace";
    modal.style.overflow = "auto";

    // Add close button
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "10px";
    closeBtn.style.right = "10px";
    closeBtn.onclick = () => modal.remove();
    modal.appendChild(closeBtn);

    // Add title
    const title = document.createElement("h2");
    title.textContent = `Motion Analysis: ${motionName}`;
    modal.appendChild(title);

    // Add metrics
    const metrics = document.createElement("div");
    metrics.innerHTML = `
      <h3>Motion Metrics</h3>
      <ul>
        <li>Duration: ${motionData.metrics.duration}ms</li>
        <li>Max Displacement: ${motionData.metrics.maxDisplacement.toFixed(
          4
        )}</li>
        <li>Average Speed: ${motionData.metrics.averageSpeed.toFixed(
          4
        )} units/sec</li>
        <li>Total Frames: ${motionData.sequence.length}</li>
      </ul>
    `;

    // Add joint importance button
    const importanceBtn = document.createElement("button");
    importanceBtn.textContent = "Edit Joint Importance";
    importanceBtn.style.marginTop = "10px";
    importanceBtn.style.padding = "5px 10px";
    importanceBtn.style.backgroundColor = "#9C27B0";
    importanceBtn.style.color = "white";
    importanceBtn.style.border = "none";
    importanceBtn.style.borderRadius = "3px";
    importanceBtn.style.cursor = "pointer";
    importanceBtn.onclick = () => {
      // Close visualization and open importance editor
      modal.remove();
      if (typeof window.createJointImportanceUI === "function") {
        window.createJointImportanceUI(motionName);
      } else {
        this.logDebug("Joint importance UI not available");
      }
    };
    metrics.appendChild(document.createElement("br"));
    metrics.appendChild(importanceBtn);

    modal.appendChild(metrics);

    // Rest of the visualization code...
    // Add to document
    document.body.appendChild(modal);
  }

  // Draw angle changes over time
  drawAngleChanges(ctx, width, height, relativeMotion) {
    if (!ctx || !relativeMotion || relativeMotion.length < 2) return;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw background grid
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    for (let i = 0; i < height; i += 25) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    // Calculate x scale to fit all frames
    const xScale = (width - 20) / (relativeMotion.length - 1);

    // Draw angle changes for key joints
    // Only draw a few important angles to avoid clutter
    const keyAngles = [
      { key: "angle_23_25_25_27", name: "Left Knee", color: "red" },
      { key: "angle_24_26_26_28", name: "Right Knee", color: "blue" },
      { key: "angle_11_13_13_15", name: "Left Elbow", color: "orange" },
      { key: "angle_12_14_14_16", name: "Right Elbow", color: "green" },
    ];

    // First, find angles that exist in the data
    const availableAngles = [];
    for (const angle of keyAngles) {
      if (
        relativeMotion[0].jointAngles &&
        relativeMotion[0].jointAngles[angle.key] !== undefined
      ) {
        availableAngles.push(angle);
      }
    }

    // Draw each available angle
    for (const angle of availableAngles) {
      ctx.strokeStyle = angle.color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      // Start with first frame angle
      const firstY =
        height -
        ((relativeMotion[0].jointAngles[angle.key] / Math.PI) * height) / 2;
      ctx.moveTo(10, firstY);

      // Draw line for each subsequent frame
      for (let i = 1; i < relativeMotion.length; i++) {
        if (
          relativeMotion[i].jointAngles &&
          relativeMotion[i].jointAngles[angle.key] !== undefined
        ) {
          const x = 10 + i * xScale;
          // Scale angle (0 to π) to fit in canvas height
          const y =
            height -
            ((relativeMotion[i].jointAngles[angle.key] / Math.PI) * height) / 2;
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Add to legend
      ctx.fillStyle = angle.color;
      ctx.fillRect(
        width - 120,
        10 + availableAngles.indexOf(angle) * 15,
        10,
        10
      );
      ctx.fillStyle = "white";
      ctx.font = "10px monospace";
      ctx.fillText(
        angle.name,
        width - 105,
        18 + availableAngles.indexOf(angle) * 15
      );
    }
  }

  drawMovementGraph(ctx, width, height, sequence) {
    if (!ctx || sequence.length < 2) return;

    // Key joints to visualize
    const keyJoints = [
      { index: 15, name: "Left Wrist", color: "red" },
      { index: 16, name: "Right Wrist", color: "blue" },
      { index: 11, name: "Left Shoulder", color: "orange" },
      { index: 12, name: "Right Shoulder", color: "green" },
    ];

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw background grid
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    for (let i = 0; i < height; i += 25) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    // Calculate x scale to fit all frames
    const xScale = (width - 20) / (sequence.length - 1);

    // Draw movement for each key joint
    for (const joint of keyJoints) {
      ctx.strokeStyle = joint.color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      // Start with first frame position
      const firstY = sequence[0].pose[joint.index].y * height;
      ctx.moveTo(10, firstY);

      // Draw line to each subsequent frame
      for (let i = 1; i < sequence.length; i++) {
        const x = 10 + i * xScale;
        const y = sequence[i].pose[joint.index].y * height;
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Add legend
      ctx.fillStyle = joint.color;
      ctx.fillRect(width - 100, 10 + keyJoints.indexOf(joint) * 15, 10, 10);
      ctx.fillStyle = "white";
      ctx.font = "10px monospace";
      ctx.fillText(joint.name, width - 85, 18 + keyJoints.indexOf(joint) * 15);
    }
  }

  exportMotion(motionName) {
    const motionData = this.savedMotions.get(motionName);
    if (!motionData) {
      this.logDebug(`Cannot export: No motion data for ${motionName}`);
      return;
    }

    // Get joint importance data
    const importance = this.jointImportance.get(motionName) || {};

    // Create a downloadable JSON file with importance included
    const exportData = {
      sequence: motionData.sequence,
      metrics: motionData.metrics,
      relativeMotion: motionData.relativeMotion,
      importance: importance, // Include joint importance in export
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `motion_${motionName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.logDebug(`Exported motion: ${motionName}`);
  }

  importMotion(jsonData, motionName) {
    try {
      const motionData = JSON.parse(jsonData);
      if (!motionData.sequence || !motionData.metrics) {
        this.logDebug("Invalid motion data format");
        return false;
      }

      // For older motion data without relative motion data, calculate it
      if (!motionData.relativeMotion && motionData.sequence.length > 0) {
        motionData.relativeMotion = this.calculateRelativeMotionData(
          motionData.sequence
        );
        this.logDebug("Added relative motion data to imported motion");
      }

      // Save motion data
      this.savedMotions.set(motionName, motionData);

      // Import joint importance if available, otherwise initialize defaults
      if (motionData.importance) {
        this.jointImportance.set(motionName, motionData.importance);
        this.logDebug("Imported joint importance data");
      } else {
        this.initializeDefaultJointImportance(motionName);
        this.logDebug("Initialized default joint importance (none in import)");
      }

      this.logDebug(`Imported motion: ${motionName}`, {
        frames: motionData.sequence.length,
        metrics: motionData.metrics,
      });
      return true;
    } catch (e) {
      this.logDebug(`Error importing motion: ${e.message}`);
      return false;
    }
  }
  listSavedMotions() {
    return Array.from(this.savedMotions.keys());
  }
}
