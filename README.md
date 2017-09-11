AIM Robot IO
============================
## Installation 

```sh
go get github.com/petchumpriwan/aimbotio
```

replace these files with new files from aimbotio/edited_files

```sh
github/meedee-rpi/graphql-server/src/server.js 
# Remove server namespace

github/meedee-rpi/python-server/server.py
# Remove server namespace and add function to convert string to dictionary
```

then run this command on terminal
```sh
cd github/meedee-rpi/graphql-server
npm run build
sudo npm run serve

cd github/meedee-rpi/python-server
python server.py
```

## Motor

Motor on AIM Robot can be controlled by sending desired position to the Motor Server which run on Python via socket.io websocket communications protocol.

The position of motor represents the position of robot's head, arms and body.

### Sample Code
``` golang
package main

import (
	"time"

	"github.com/petchumpriwan/aimbotio"
)

func main() {
	myMotor := aimbotio.Motor()
	myMotor.Connect(7000)               // Connect to motor server on port 7000

	// Set Position of Head, Left Arm, Right Arm, Trunk respectively
	myMotor.Drive(100, -100, 100, 50)
	// Input can be vary from -100 to 100 which 0 means middle position

	time.Sleep(1500 * time.Millisecond) // Wait motor to move to desired position

	myMotor.Drive(-100, 100, -100, -50)
	time.Sleep(2000 * time.Millisecond)

	myMotor.Drive(0, 0, 0, 0)           // Move to default position

	myMotor.Disconnect()                // Disconnect from motor server

}
```

References
* Socketio Library in Golang : https://github.com/graarh/golang-socketio 