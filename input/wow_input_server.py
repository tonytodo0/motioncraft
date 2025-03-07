# wow/wow_input_server.py
from flask import Flask
from flask_sock import Sock
import keyboard
import json
import win32gui
import win32api
import win32con
import time
from flask_sock import ConnectionClosed
import threading

app = Flask(__name__)
sock = Sock(app)

# Track current key states and their values
current_states = {
    'forward': 0,
    'backward': 0,
    'left': 0,
    'right': 0,
    'jump': 0,
    'ability1': 0,
    'ability2': 0,
    'ability3': 0,
    'tab': 0,
    'right_click': 0,
    'left_click': 0,
    'xx': 0
}

# Mouse movement settings
MOUSE_SENSITIVITY = 25  # Adjust this value to change mouse movement speed
last_mouse_update = time.time()
MOUSE_UPDATE_INTERVAL = 0.016  # Approximately 60Hz

# Key mappings with thresholds
KEY_MAPPINGS = {
    'forward': {'key': 'w', 'threshold': 0.1},
    'backward': {'key': 's', 'threshold': 0.1},
    'left': {'key': 'a', 'threshold': 0.1},
    'right': {'key': 'd', 'threshold': 0.1},
    'jump': {'key': 'space', 'threshold': 0.5},
    'ability1': {'key': '1', 'threshold': 0.5},
    'ability2': {'key': '2', 'threshold': 0.5},
    'ability3': {'key': '3', 'threshold': 0.5},
    'tab': {'key': 'tab', 'threshold': 0.5},
    'right_click': {'threshold': 0.1},
    'left_click': {'threshold': 0.1},
    'xx': {'key':'t','threshold': 0.5}
}

# Global state to track if WoW is focused
wow_is_focused = False

# Lock for thread safety when updating global state
state_lock = threading.Lock()

def is_wow_focused():
    """Check if WoW window is focused"""
    # TODO FOR NOW
    return True
    window_title = win32gui.GetWindowText(win32gui.GetForegroundWindow()).lower()
    return 'warcraft' in window_title

def check_wow_focus():
    """Background thread to continuously check if WoW is focused"""
    global wow_is_focused
    while True:
        focused = is_wow_focused()
        with state_lock:
            if wow_is_focused != focused:
                wow_is_focused = focused
                print(f"WoW focus state changed: {'FOCUSED' if focused else 'NOT FOCUSED'}")
        time.sleep(0.5)  # Check every half second

def update_mouse_position(x_axis, y_axis, use_right_click=False, use_left_click=False):
    """Update mouse cursor position based on joystick input with smoothing"""
    global last_mouse_update, last_x_value, last_y_value
    
    # Only process mouse movement if WoW is focused
    with state_lock:
        if not wow_is_focused:
            return False
    
    current_time = time.time()
    if current_time - last_mouse_update < MOUSE_UPDATE_INTERVAL:
        return False
    
    last_mouse_update = current_time

    # Apply larger deadzone to prevent drift and snapback
    if abs(x_axis) < 0.05:
        x_axis = 0
    if abs(y_axis) < 0.05:
        y_axis = 0

    # If stick is in neutral position, release mouse buttons and return
    if x_axis == 0 and y_axis == 0:
        if use_right_click:
            win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
        if use_left_click:
            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        return False
    
    # Apply smoothing by averaging with previous values
    if hasattr(update_mouse_position, 'last_x'):
        smoothed_x = 0.7 * x_axis + 0.3 * update_mouse_position.last_x
        smoothed_y = 0.7 * y_axis + 0.3 * update_mouse_position.last_y
    else:
        smoothed_x = x_axis
        smoothed_y = y_axis
    
    # Store current values for next frame
    update_mouse_position.last_x = x_axis
    update_mouse_position.last_y = y_axis
    
    # Get current mouse position
    current_x, current_y = win32gui.GetCursorPos()
    
    # Apply non-linear scaling for finer control
    # Square the value but keep the sign for better precision at low movement
    x_direction = 1 if smoothed_x > 0 else -1
    y_direction = 1 if smoothed_y > 0 else -1
    
    x_magnitude = abs(smoothed_x) ** 1.5  # Exponential response curve
    y_magnitude = abs(smoothed_y) ** 1.5
    
    # Calculate new position with adjusted sensitivity
    delta_x = int(x_direction * x_magnitude * MOUSE_SENSITIVITY)
    delta_y = int(y_direction * y_magnitude * MOUSE_SENSITIVITY)
    
    # Move mouse to new position
    new_x = current_x + delta_x
    new_y = current_y + delta_y
    
    try:
        win32api.SetCursorPos((new_x, new_y))
        
        if use_right_click:
            win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
        elif use_left_click:
            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        
        return True
    except Exception as e:
        print(f"Error updating mouse position: {e}")
        return False

def update_mouse_state(action, value):
    """Update mouse button state"""
    with state_lock:
        if not wow_is_focused:
            return
    
    threshold = KEY_MAPPINGS[action]['threshold']
    was_pressed = current_states[action] >= threshold
    is_pressed = value >= threshold
    
    if was_pressed != is_pressed:
        try:
            if action == 'right_click':
                if is_pressed:
                    win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
                else:
                    win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
            elif action == 'left_click':
                if is_pressed:
                    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
                else:
                    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        except Exception as e:
            print(f"Error updating mouse state: {e}")
    
    current_states[action] = value

def update_key_state(key, value):
    """Update key state based on value and threshold"""
    # Skip if WoW is not focused
    with state_lock:
        if not wow_is_focused:
            return
    
    if key in ['right_click', 'left_click']:
        update_mouse_state(key, value)
        return

    threshold = KEY_MAPPINGS[key]['threshold']
    key_code = KEY_MAPPINGS[key]['key']
    
    was_pressed = current_states[key] >= threshold
    is_pressed = value >= threshold
    
    if was_pressed != is_pressed:
        try:
            if is_pressed:
                keyboard.press(key_code)
            else:
                keyboard.release(key_code)
        except Exception as e:
            print(f"Error updating key {key}: {e}")
    
    current_states[key] = value

def release_all_inputs():
    """Release all pressed keys and mouse buttons"""
    for key in current_states:
        if key == 'right_click':
            if current_states[key] >= KEY_MAPPINGS[key]['threshold']:
                win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
        elif key == 'left_click':
            if current_states[key] >= KEY_MAPPINGS[key]['threshold']:
                win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        elif current_states[key] >= KEY_MAPPINGS[key]['threshold']:
            keyboard.release(KEY_MAPPINGS[key]['key'])
        current_states[key] = 0

active_connections = set()

def perform_single_click(use_right_click=False):
    """Perform a single click and release of a mouse button"""
    with state_lock:
        if not wow_is_focused:
            return
    
    try:
        if use_right_click:
            win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
            time.sleep(0.05)  # Short delay to register as a click
            win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
        else:
            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
            time.sleep(0.05)  # Short delay to register as a click
            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        return True
    except Exception as e:
        print(f"Error performing single click: {e}")
        return False

def broadcast_data(data, sender):
    """Broadcast data to all clients except sender and remove stale connections"""
    stale_connections = set()
    
    for client in active_connections:
        if client != sender:
            try:
                client.send(json.dumps(data))
            except ConnectionClosed:
                stale_connections.add(client)
            except Exception as e:
                print(f"Error broadcasting to client: {e}")
                stale_connections.add(client)
    
    # Remove stale connections
    active_connections.difference_update(stale_connections)

@sock.route('/ws')
def websocket(ws):
    print(f"WebSocket connection established. Active connections: {len(active_connections) + 1}")
    active_connections.add(ws)
    last_right_click_state = False
    last_left_click_state = False
    
    # Add variables to track button press timing and movement
    grip_press_time = None
    trigger_press_time = None
    grip_significant_movement = False
    trigger_significant_movement = False
    last_grip_state = False
    last_trigger_state = False
    
    # Add variables for scroll timing
    last_left_scroll_time = 0
    last_right_scroll_time = 0
    scroll_cooldown = 0.15  # Cooldown between scroll actions in seconds
    
    # Clean state when new connection is established
    release_all_inputs()
    
    try:
        while True:
            message = ws.receive()
            data = json.loads(message)
            
            # Process motion key commands
            if 'type' in data and data['type'] == 'motion_key_command':
                with state_lock:
                    should_process = wow_is_focused
                
                if not should_process:
                    continue
                
                key = data.get('key', '').lower()
                modifiers = data.get('modifiers', [])
                action = data.get('action', '')
                
                print(f"Motion key command: {action} {'+'.join(modifiers + [key])}")
                
                # Process modifiers (ctrl, shift, alt)
                if action == "press":
                    for modifier in modifiers:
                        try:
                            keyboard.press(modifier)
                        except Exception as e:
                            print(f"Error pressing modifier {modifier}: {e}")
                
                # Process the main key
                try:
                    if action == "press":
                        keyboard.press(key)
                    elif action == "release":
                        keyboard.release(key)
                except Exception as e:
                    print(f"Error with key {key} ({action}): {e}")
                
                # Release modifiers if we're doing a release action
                if action == "release":
                    for modifier in reversed(modifiers):  # Release in reverse order
                        try:
                            keyboard.release(modifier)
                        except Exception as e:
                            print(f"Error releasing modifier {modifier}: {e}")
                
                continue  # Skip the rest of the processing for this message
            
            # Process controller data (existing code)
            # Broadcast received data to all other connected clients
            broadcast_data(data, ws)
            
            # Only process inputs if WoW is focused
            with state_lock:
                should_process = wow_is_focused
            
            if not should_process:
                # Release any pressed buttons when WoW loses focus
                release_all_inputs()
                continue
                
            # Process left controller
            if 'leftController' in data:
                left = data['leftController']
                # Movement from thumbstick
                if 'axes' in left:
                    update_key_state('left', abs(min(0, left['axes'][0])))
                    update_key_state('right', max(0, left['axes'][0]))
                    update_key_state('forward', abs(min(0, left['axes'][1])))
                    update_key_state('backward', max(0, left['axes'][1]))
                
                # Other left controller buttons
                if 'buttons' in left:
                    update_key_state('jump', left['buttons'].get('Y', 0))
                    update_key_state('tab', left['buttons'].get('X', 0))
                    #update_key_state('right_click', left['buttons'].get('grip', 0))
                    #update_key_state('xx', left['buttons'].get('trigger', 0))
                    
                    # Handle left thumbstick click for mouse scroll in (wheel up)
                    if left['buttons'].get('thumbstick', 0) > 0.5:
                        current_time = time.time()
                        # Only perform scroll if cooldown has elapsed
                        if current_time - last_left_scroll_time > scroll_cooldown:
                            # Scroll up (positive value = zoom in)
                            win32api.mouse_event(win32con.MOUSEEVENTF_WHEEL, 0, 0, 120, 0)
                            # print("Mouse scroll in (wheel up)")
                            last_left_scroll_time = current_time
            
            # Process right controller
            if 'rightController' in data:
                right = data['rightController']
                
                # Check for button states and handle timing
                if 'buttons' in right:
                    current_grip_state = right['buttons'].get('grip', 0) > KEY_MAPPINGS['xx']['threshold']
                    current_trigger_state = right['buttons'].get('trigger', 0) > KEY_MAPPINGS['left_click']['threshold']
                    
                    # Handle right thumbstick click for mouse scroll out (wheel down)
                    if right['buttons'].get('thumbstick', 0) > 0.5:
                        current_time = time.time()
                        # Only perform scroll if cooldown has elapsed
                        if current_time - last_right_scroll_time > scroll_cooldown:
                            # Scroll down (negative value = zoom out)
                            win32api.mouse_event(win32con.MOUSEEVENTF_WHEEL, 0, 0, -120, 0)
                            # print("Mouse scroll out (wheel down)")
                            last_right_scroll_time = current_time
                    
                    # Handle grip button press and release (right click)
                    if current_grip_state and not last_grip_state:
                        # Grip button just pressed
                        grip_press_time = time.time()
                        grip_significant_movement = False
                    elif not current_grip_state and last_grip_state:
                        # Grip button just released
                        if grip_press_time is not None:
                            grip_duration = time.time() - grip_press_time
                            # If held for less than 0.5 seconds and no significant movement, perform single right click
                            if grip_duration < 0.5 and not grip_significant_movement:
                                win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
                                time.sleep(0.05)  # Short delay to register as a click
                                win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
                                # print("Quick right click performed")
                        grip_press_time = None
                    
                    # Handle trigger button press and release (left click)
                    if current_trigger_state and not last_trigger_state:
                        # Trigger button just pressed
                        trigger_press_time = time.time()
                        trigger_significant_movement = False
                    elif not current_trigger_state and last_trigger_state:
                        # Trigger button just released
                        if trigger_press_time is not None:
                            trigger_duration = time.time() - trigger_press_time
                            # If held for less than 0.5 seconds and no significant movement, perform single left click
                            if trigger_duration < 0.5 and not trigger_significant_movement:
                                win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
                                time.sleep(0.05)  # Short delay to register as a click
                                win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
                                # print("Quick left click performed")
                        trigger_press_time = None
                    
                    # Update states for next iteration
                    last_grip_state = current_grip_state
                    last_trigger_state = current_trigger_state
                    
                    # Continue with existing functionality
                    update_key_state('left_click', right['buttons'].get('trigger', 0))
                    grip_active = current_grip_state
                    trigger_active = current_trigger_state
                else:
                    grip_active = False
                    trigger_active = False

                # Mouse movement from right thumbstick
                if 'axes' in right and (abs(right['axes'][0]) > 0.01 or abs(right['axes'][1]) > 0.01):
                    # Mark significant movement if buttons are currently pressed
                    if grip_press_time is not None:
                        grip_significant_movement = True
                    if trigger_press_time is not None:
                        trigger_significant_movement = True
                        
                    if grip_active:
                        # Use right-click movement when grip is held
                        moved = update_mouse_position(right['axes'][0], right['axes'][1], True, False)
                        if moved:
                            last_right_click_state = True
                            if last_left_click_state:
                                win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
                                last_left_click_state = False
                    elif trigger_active:
                        # Use left-click movement when trigger is held (unchanged)
                        moved = update_mouse_position(right['axes'][0], right['axes'][1], False, True)
                        if moved:
                            last_left_click_state = True
                            if last_right_click_state:
                                win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
                                last_right_click_state = False
                    else:
                        # Regular mouse movement (without right-click) when neither is held
                        update_mouse_position(right['axes'][0], right['axes'][1], False, False)
                        # Ensure mouse buttons are released
                        if last_right_click_state:
                            win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
                            last_right_click_state = False
                        if last_left_click_state:
                            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
                            last_left_click_state = False
                else:
                    # Release mouse buttons when thumbstick is neutral
                    if last_right_click_state and not grip_active:
                        win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
                        last_right_click_state = False
                    if last_left_click_state and not trigger_active:
                        win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
                        last_left_click_state = False
                        
                # Handle right-click state when grip is pressed but thumbstick isn't moved
                if grip_active and not last_right_click_state and ('axes' not in right or 
                                                                (abs(right['axes'][0]) <= 0.01 and abs(right['axes'][1]) <= 0.01)):
                    win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
                    last_right_click_state = True
                elif not grip_active and last_right_click_state:
                    win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
                    last_right_click_state = False
    
    except ConnectionClosed:
        print("WebSocket connection closed normally")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        active_connections.remove(ws)
        print(f"Connection removed. Active connections: {len(active_connections)}")
        # Release all keys and mouse buttons on disconnect
        release_all_inputs()        

def start_background_threads():
    """Start all background threads"""
    # Thread to check if WoW is focused
    focus_thread = threading.Thread(target=check_wow_focus, daemon=True)
    focus_thread.start()

if __name__ == '__main__':
    print("Starting WoW VR Input Server with WebSocket on port 5000...")
    print("Current key mappings:")
    for action, mapping in KEY_MAPPINGS.items():
        if action == 'right_click':
            print(f"  {action}: Right Mouse Button (threshold: {mapping['threshold']})")
        elif action == 'left_click':
            print(f"  {action}: Left Mouse Button (threshold: {mapping['threshold']})")
        else:
            print(f"  {action}: {mapping['key']} (threshold: {mapping['threshold']})")
    print("\nMouse sensitivity:", MOUSE_SENSITIVITY)
    print("\nMake sure World of Warcraft is running!")
    print("Input commands will only be sent when WoW window is in focus.")
    
    # Start background threads
    start_background_threads()
    
    app.run(port=5000)