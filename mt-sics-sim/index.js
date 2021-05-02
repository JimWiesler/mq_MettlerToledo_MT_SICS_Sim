'use strict';
const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');
const EventEmitter = require('events');
const os = require('os');
const repl = require('repl');
//*****************************
// Environment variables
// TTY: '/dev/ttyUSB1'


//*******************************************
// MettlerToledo MT-SICS Simulatorclass
//*******************************************
class MettlerToledoSim extends EventEmitter {
    constructor(cfg) {
        super();
        this.state = 'Closed'; // See State Machine: Closed, Opening, Offline, Initializing, Online, Closing
        this.cfg = cfg;
        this.port = null;
        this.readParser = null;
        this.meterConfig = {
            'Make': 'Mettler Toledo',
            'Model': 'SimModel',
            'Type': 'SimType',
            'SerialNumber': 'X12345678',
            'FirmwareRev': 'SIM.0.0.0',
            'Configuration': {
                'WeighMode': '0',
                'EnvironmentalStablility': '2',
                'AutoZeroMode': '1',
                'StandbyTimeout': '0'
            },
        };
    };
    // Open port
    open() {
        const me = this;
        try {
            this.port = new SerialPort(this.cfg.tty, {
                baudRate: this.cfg.baudrate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
              });
            this.readParser = this.port.pipe(new Readline({ delimiter: '\r\n' }));
            this.readParser.on('data', function (data) {
                me.read(data);
            });
            this.port.on('error', function(error) {
                me.emit('error', { utc: utc(), payload: 'Port Error: '+ error });
                me.close();
            });
            this.port.on('close', function(res) {
                me.setState('Closed');
            });
            this.setState('Offline');
        } catch (error) {
            this.emit('error', { utc: utc(), payload: 'Port Failed to open: ', error });
            this.setState('Closed');
        }
    };

    // Close port
    close() {
        this.setState('Closing');
        if (this.port.isOpen) {
            this.port.close(); // Note - Close event handler will manage the state change to Closed
        } else {
            this.setState('Closed');
        }
    };

    // State management
    setState(newState) {
        console.log('setState ==> Old State: '+this.state+' New State: '+newState);
        this.state = newState;
        this.emit("state", { utc: utc(), payload: this.state} );
    };

            // All read handling
    read(inp) {
        // If prompt string is in result, this is an Echo and should be discarded
        let responseToCommand = false;
        // console.log('Input: "'+inp+'" Cmd: "'+this.lastCommand.cmd.replace('\r\n', '')+'"')

        // Clean up the input by trimming and deleting any CR LF or ESC characters
        inp = inp.replace('\n','').replace('\r','').replace('\x1B', '').trim(); // LF, CR, ESC, white space
        inp = inp.replace('@', 'I4'); // @ is reset, but response is same as I4 request for S/N
        if (inp.length === 0) return; // Ignore blank lines

        // Send event that new input received
        this.emit('rx', { utc: utc(), payload: inp });
 
        // Determine what type of input it is and handle it
        let inMatch = inp.match(/^(\S+)/);
        if (!inMatch) {
            console.log ('Command Not Valid: "'+inp, error);
            return;
        }
        let cmdID = '';

        try {
            cmdID = inMatch[1]; // The first word received is the command
            cmdID = cmdID.replace('SI', 'S'); // The first word of command (@ produces same response as I4)
        } catch (error) {
            console.log ('Command Not Valid: "'+inp, error);
            return;
        }

        if (cmdID === 'S') { // Scale value - weight
            this.write('S S '+(Math.trunc((new Date()).getSeconds()/10)*10).toFixed(2)+' KG');
        } else if (cmdID === 'TA') { // Tare weight
            this.write('TA A '+(Math.trunc((new Date()).getSeconds()/10)*10).toFixed(2)+' KG');
        } else if (cmdID === 'I11') { // Model
            this.write('I11 A "'+this.meterConfig.Model+'"');
        } else if (cmdID === 'I2') { // Scale Type
            this.write('I2 A "'+this.meterConfig.Type+'"');
        } else if (cmdID === 'I4') { // Serial Number
            this.write('I4 A "'+this.meterConfig.SerialNumber+'"');
        } else if (cmdID === 'I3') { // Firmware
            this.write('I3 A "'+this.meterConfig.FirmwareRev+'"');
        } else if (cmdID === 'M01') { // Weigh Mode
            this.write('M01 A '+this.meterConfig.Configuration.WeighMode);
        } else if (cmdID === 'M02') { // Stability
            this.write('M02 A '+this.meterConfig.Configuration.EnvironmentalStablility);
        } else if (cmdID === 'M03') { // Auto Zero mode
            this.write('M03 A '+this.meterConfig.Configuration.AutoZeroMode);
        } else if (cmdID === 'M16') { // Standby Timeout
            this.write('M16 A '+this.meterConfig.Configuration.StandbyTimeout);
        } else { // response for TIM DAT I10 D DW M12 
            this.write(cmdID+' A');
        }
    };

    write(out) {
        this.port.write(out+'\r\n');
        this.emit('tx', { utc: utc(), payload: out });
    };

};

// Utility functions
function utc() { // Generate ISO string of current date/time in UTC
    return (new Date().toISOString());
}


const scalesim = new MettlerToledoSim({
    tty: (process.env.TTY || '/dev/ttyUSB1'),
    baudrate: 38400
});
scalesim.open();

scalesim.on('error', (res) => console.log('Event->error:', res));
scalesim.on('state', (res) => console.log('Event->state:', res));
// scalesim.on('tx', (res) => console.log('Event->tx:', res));
// scalesim.on('rx', (res) => console.log('Event->rx:', res));

repl.start('> ').context.s = scalesim;
