package aimbotio

import (
	"log"
	"time"

	"github.com/graarh/golang-socketio"
	"github.com/graarh/golang-socketio/transport"
)

const delay = 2

type connection struct {
	port   int
	name   string
	client *gosocketio.Client
}

func connect(connection *connection) {
	var err error
	connection.client, err = gosocketio.Dial(
		gosocketio.GetUrl("localhost", connection.port, false),
		transport.GetDefaultWebsocketTransport())
	if err != nil {
		log.Printf("%s Server (*%d) : Connection Error", connection.name, connection.port)
		log.Fatal(err)
	} else {
		log.Printf("%s Server (*%d) : Connection Established", connection.name, connection.port)
	}

	time.Sleep(delay * time.Microsecond)
}

func emit(connection *connection, eventName string, data string) {
	err := connection.client.Emit(eventName, data)
	if err != nil {
		log.Fatal(err)
	} else {
		log.Printf("%s Server (*%d) : Data Transmitted : %s", connection.name, connection.port, data)
	}
	time.Sleep(delay * time.Microsecond)
}

func disconnect(connection *connection) {
	connection.client.Close()
	log.Printf("%s Server (*%d) : Disconnected", connection.name, connection.port)
}
