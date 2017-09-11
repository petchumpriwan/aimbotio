package main

import (
	"time"

	"github.com/petchumpriwan/aimbotio"
)

func main() {
	myMotor1 := aimbotio.Motor()
	myMotor1.Connect(7000)
	myMotor1.Drive(100, -100, 100, 50)
	time.Sleep(1500 * time.Millisecond)
	myMotor1.Drive(-100, 100, -100, -50)
	time.Sleep(2000 * time.Millisecond)
	myMotor1.Drive(0, 0, 0, 0)
	myMotor1.Disconnect()

}
