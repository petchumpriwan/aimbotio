import socketio
import eventlet
from flask import Flask
from flask_socketio import SocketIO
import eventlet
import smbus
import lirc
import RPi.GPIO as GPIO
from ast import literal_eval

from ax12 import Ax12
from rx import Observable, Observer
from rx.concurrency import ThreadPoolScheduler
import time
from threading import currentThread
import multiprocessing
from diagnostics_observer import DiagObserver

eventlet.monkey_patch(socket=True, time=False, thread=True)

app = Flask(__name__)
sio = SocketIO(app)
servos = Ax12()

#  setup button input pins
BTN_1 = 6
BTN_2 = 13
BTN_3 = 19
BTN_4 = 26
SOUND_PIN = 5
MOTOR_PIN = 9

GPIO.setmode(GPIO.BCM)  # set board mode to Broadcom
GPIO.setup(BTN_1,GPIO.IN)
GPIO.setup(BTN_2,GPIO.IN)
GPIO.setup(BTN_3,GPIO.IN)
GPIO.setup(BTN_4,GPIO.IN)
GPIO.setup(SOUND_PIN, GPIO.OUT)
GPIO.output(SOUND_PIN, GPIO.LOW)
GPIO.setup(MOTOR_PIN, GPIO.OUT)
GPIO.output(MOTOR_PIN, GPIO.HIGH)

IODIR = 0x00 # I/O DIRECTION REGISTER
GPIO_ROBOT  = 0x09 # Set/Reset GPIO REGISTER
output_mode  = 0x00

bus = smbus.SMBus(1)  # I2C port 1

control_byte = 0x21  # control byte not include R/W bit use just 7 bit

def write_output(control_byte, register_address, value):
	bus.write_byte_data(control_byte, register_address, value)

write_output(control_byte, IODIR, output_mode) # setup output port A
# WriteOutput(control_byte,GPIOA,0x00) # Write the output to port A
# time.sleep(3)
write_output(control_byte, GPIO_ROBOT, 0xFF) # Write the output to port A
time.sleep(0.5)

#  setup ir-remote
sockid = lirc.init("myprogram", blocking=False)

# calculate number of CPUs
optimal_thread_count = multiprocessing.cpu_count() + 1
pool_scheduler = ThreadPoolScheduler(optimal_thread_count)

lirc2payload = { 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6,\
                  'seven': 7, 'eight': 8, 'nine': 9, 'zero': 0, 'left': 11,\
                  'right': 12, 'next': 14, 'back': 13, 'repeat': 15 }

print("We are using {0} threads".format(optimal_thread_count))

def check_button_press():
    button_map = { 6: 3, 13: 5, 19: 4, 26: 2}
    return [v for k,v in button_map.items() if GPIO.input(k) == 0]

def check_remote_press():
    return lirc.nextcode()

def setup_gpio_stream(poll_interval):
    gpio_button_poll = Observable.interval(poll_interval)
    gpio_stream = gpio_button_poll \
                    .map(lambda x: check_button_press())
    return gpio_stream

def setup_lirc_stream(poll_interval):
    lirc_remote_poll = Observable.interval(poll_interval)
    lirc_stream = lirc_remote_poll \
                    .map(lambda x: check_remote_press()) \
                    .filter(lambda buttons: len(buttons) > 0)
    return lirc_stream

def resetTorque(x):
    servos.setTorqueLimit(x, 1023)
    return x

def gpio2ble(payload):
    '''To convert gpio payload to ble payload standard'''
    return { 'type': 'ble:contents:payload', 'payload': payload }

def lirc2ble(payload):
    if payload == 11:
       return { 'type': 'ble:contents:pos' }
    elif payload == 12:
        return { 'type': 'ble:contents:neg' }
    elif payload == 13:
        return { 'type': 'ble:contents:prev' }
    elif payload == 14:
        return { 'type': 'ble:contents:next' }
    elif payload == 15:
        return { 'type': 'ble:contents:repeat' }
    else:
        return { 'type': 'ble:contents:payload', 'payload': payload }

@app.route('/')
def index():
    return "Servo controller."

@sio.on('connect')
def connect():
    print('Connected to Central Node.')
    gpio_stream = setup_gpio_stream(600)
    gpio_stream.subscribe(on_next=lambda b: [sio.emit('gpio_button_press', data=gpio2ble(v)) for v in b],
                          on_error=lambda e: sio.emit('gpioError', data=e),
                          on_completed=lambda: sio.emit('gpioComplete'))
    lirc_stream = setup_lirc_stream(200)
    lirc_stream.subscribe(on_next=lambda c:\
            sio.emit('lirc_button_press', data=\
            lirc2ble(lirc2payload[c[0]])),
                          on_error=lambda e: sio.emit('lircError', data=e),
                          on_completed=lambda: sio.emit('lircComplete'))

@sio.on('diagnostics')
def diagnostics(payload):
    control_stream = Observable.interval(100)
    statuses = []
    Observable.from_(payload) \
        .zip(control_stream, lambda x, i: x) \
        .observe_on(pool_scheduler) \
        .map(lambda x: resetTorque(x)) \
        .map(lambda x: (x, servos.ping(x))) \
        .on_error_resume_next(Observable.just((-1, -1))) \
        .subscribe(on_next=lambda result: statuses.append(result),
                   on_error=lambda e: sio.emit('diagError', data=e),
                   on_completed=lambda: sio.emit('diagComplete', data=statuses))


@sio.on('moveCommand')
def message(command_payload):
    if isinstance(command_payload,str):
        command_payload = literal_eval(command_payload)
    motor_speed = command_payload['speed']
    command_stream = Observable.from_(zip(command_payload.keys(), command_payload.values())) \
            .filter(lambda x: x[0] != 'speed') \
            .map(lambda x: (int(x[0]), x[1], motor_speed))
    control_stream = Observable.interval(100)

    Observable.zip(command_stream, control_stream, lambda x, i: x) \
            .map(lambda cmd: servos.moveSpeed(cmd[0], cmd[1], cmd[2])) \
            .subscribe(lambda x: print(x))


@sio.on('disconnect')
def disconnect():
    print('Disconnected from Central Node.')

if __name__ == '__main__':
    sio.run(app, port=7000)
