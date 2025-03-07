Motioncraft

A comprehensive VR and motion control system for World of Warcraft (or any game), combining VR controller mapping with gesture-based commands detected through a webcam.

Overview

This project consists of three interconnected components that work together:

VR Controller Interface - Uses WebXR to map VR controller inputs to WoW actions
Motion Detection System - Uses MediaPipe Pose to recognize physical motions via webcam
Input Server - Translates VR and motion inputs into keyboard/mouse commands for WoW

The system allows you to play any game using controller movements for navigation and camera control, while also performing custom motions (like raising your arm) to trigger in-game abilities.

Features

VR Controller Interface

Full mapping of Oculus/Meta Quest controllers to WoW controls
Left controller for movement (forward/back/strafe/jump)
Right controller for camera control and targeting
Trigger and grip buttons for mouse clicks
Face buttons for ability activation
Visual feedback of active controls

Motion Detection System

Record, save, and recognize custom body motions
Gesture analysis with advanced matching algorithms
Joint importance editor for fine-tuning recognition
Location-invariant tracking (works regardless of your position in the room)
Motion-to-key mapping for triggering abilities with gestures
Visual recording and playback tools

Input Server

WebSocket-based communication between components
Translates VR and motion controls to keyboard/mouse inputs
Supports keyboard shortcuts, mouse movement, and button clicks
Auto-reconnect capabilities

Requirements

VR headset compatible with WebXR (Oculus Quest, HTC Vive, etc.)
Webcam for motion detection
Python 3.6+ with Flask
Modern web browser supporting WebXR
The game you want to play lol

Installation:

Clone the repository:
"git clone https://github.com/tonytodo0/motioncraft"

Install Python dependencies:
"pip install flask flask-sock keyboard pywin32"

Start the input server from the input folder:
"python wow_input_server.py"

Start the VR interface from the input folder:
"http-server . -p 8080 --cors"

Start the Camera User Interface from the cam folder:
"node server.js"

Usage:

Setting Up VR Controls:
Start the input server (python wow_input_server.py)
Open the VR interface in a browser
Click "Enter VR" to start the VR session
Use the left controller thumbstick for movement
Use the right controller thumbstick for camera control
Use trigger and grip buttons for mouse clicks
Use the face buttons (A, B, X, Y) for abilities

Recording Custom Motions:
Open the motion detection system in a browser
Use the "Record" button or press 'R' to start recording a motion, or the "B" key on your right VR Controller
Perform the motion you want to record
Press "Stop", click 'S' or press the "B" key on your Controller again to save the motion, 
Name your motion when prompted

Mapping Motions to Keys:
In the motion detection interface, click "Mappings"
Select a recorded motion from the dropdown
Enter the key to trigger (e.g., "1", "shift+f", "ctrl+3")
Select the desired behavior (press and release, hold, or toggle)
Click "Save Mapping"

Using Motion Controls:
Hold the left trigger on your VR controller
Perform the motion you recorded
Release the trigger to execute the mapped key command

Advanced Configuration
Joint Importance Editor
Fine-tune which joints are most important for recognizing each motion:

Click "Analysis" in the motion detection interface
Select a motion and click "Edit Joint Importance"
Adjust sliders to give more or less weight to different joints
Higher values make that joint more important for recognition

Motion Detection Thresholds
Adjust how sensitive the system is to motions:

Min Movement: Minimum movement required to register a motion
Match Threshold: How closely a motion must match to be recognized
Motion Duration: Minimum time for a valid motion
Duration Weight: How important timing is to recognition
