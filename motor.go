package aimbotio

import (
	"fmt"
)

type motor struct {
	connection connection
	Value      motorValue
}

type motorValue struct {
	Head     angle
	LeftArm  angle
	RightArm angle
	Trunk    angle
	Speed    int
}

type angle struct {
	MinMax [2]int
	Raw    int
}

func (a *angle) cal() int {
	maxraw := 100
	minraw := -100
	if a.Raw > maxraw {
		a.Raw = maxraw
	}
	if a.Raw < minraw {
		a.Raw = minraw
	}
	return (((a.MinMax[1] - a.MinMax[0]) * (a.Raw - minraw) / (maxraw - minraw)) + a.MinMax[0])
}

// Motor object initialization
func Motor() motor {
	initializer := motor{}
	initializer.Value.Speed = 90
	initializer.connection.name = "Motor"
	initializer.Value.Head.MinMax = [2]int{461, 563}
	initializer.Value.LeftArm.MinMax = [2]int{512, 205}
	initializer.Value.RightArm.MinMax = [2]int{512, 819}
	initializer.Value.Trunk.MinMax = [2]int{205, 819}
	return initializer
}

func (m *motor) Connect(SocketioPort int) {
	m.connection.port = SocketioPort
	connect(&m.connection)
}

func (m *motor) Set(Head int, LeftArm int, RightArm int, Trunk int) {
	m.Value.Head.Raw = Head
	m.Value.LeftArm.Raw = LeftArm
	m.Value.RightArm.Raw = RightArm
	m.Value.Trunk.Raw = Trunk
}

func (m *motor) Drive(Head int, LeftArm int, RightArm int, Trunk int) {
	m.Set(Head, LeftArm, RightArm, Trunk)
	moveCommand := fmt.Sprintf("{'1': %d, '2': %d, '3': %d, '4': %d, 'speed': %d}", m.Value.Head.cal(), m.Value.LeftArm.cal(), m.Value.RightArm.cal(), m.Value.Trunk.cal(), m.Value.Speed)
	emit(&m.connection, "moveCommand", moveCommand)
}

func (m *motor) Disconnect() {
	disconnect(&m.connection)
}

//("moveCommand", "{'4': 666, '1': 461, 'speed': 90, '3': 512, '2': 512}")
