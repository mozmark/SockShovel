const {Ci, Cc} = require("chrome");
const timers = require("sdk/timers");

const socketTransportService =
  Cc["@mozilla.org/network/socket-transport-service;1"]
  .getService(Ci.nsISocketTransportService);

const wMediator = Cc["@mozilla.org/appshell/window-mediator;1"]
.getService(Ci.nsIWindowMediator);
const gThreadManager = Cc["@mozilla.org/thread-manager;1"].getService();

const EVENT_CONNECT = "sockshovel:connect"
const EVENT_RECEIVE = "sockshovel:receive"
const EVENT_SEND = "sockshovel:send"
const EVENT_SETUP = "sockshovel:setup"
const EVENT_HEARTBEAT = "sockshovel:heartbeat"

const SEGMENT_SIZE = 8192;
const SEGMENT_COUNT = 1024;

var output = null;

var handleSend = function(evt) {
  console.log("handling send");
  console.log("data is "+evt.detail);
  if (output) {
    output.write(evt.detail, evt.detail.length);
  }
};

var handleSetup = function(evt) {
  let doc = evt.originalTarget;
  let binaryStream = Cc["@mozilla.org/binaryinputstream;1"].
                              createInstance(Ci.nsIBinaryInputStream);

  var reader = {
    // NSIINPUTSTREAMCALLBACK

    /**
     * Called when more data from the incoming request is available.  This method
     * then reads the available data from input and deals with that data as
     * necessary, depending upon the syntax of already-downloaded data.
     *
     * @param input : nsIAsyncInputStream
     *   the stream of incoming data from the connection
     */
    onInputStreamReady: function(input)
    {
      console.log(input);
      let count = input.available();
      if (count > 0) {
        let read = binaryStream.readBytes(count);
        console.log("got data: "+read);

        let evt = doc.createEvent('CustomEvent');
        evt.initCustomEvent(EVENT_RECEIVE,true,false,read);
        doc.dispatchEvent(evt);
      }

      input.asyncWait(this, 0, 0, gThreadManager.currentThread);
    },

    //
    // see nsISupports.QueryInterface
    //
    QueryInterface: function(aIID)
    {
      if (aIID.equals(Ci.nsIInputStreamCallback) ||
          aIID.equals(Ci.nsISupports))
        return this;

      throw Cr.NS_ERROR_NO_INTERFACE;
    }
  };

  console.log("handling setup!");
  // TODO: check if we're cool with this
  let weAreCool = true;
  if (weAreCool) {
    let trans =
        socketTransportService.createTransport(null, 0, "127.0.0.1", 5432, null);
    var input = trans.openInputStream(0, SEGMENT_SIZE, SEGMENT_COUNT)
        .QueryInterface(Ci.nsIAsyncInputStream);

    binaryStream.setInputStream(input);

    input.asyncWait(reader, 0, 0, gThreadManager.mainThread);

    output = trans.openOutputStream(Ci.nsITransport.OPEN_BLOCKING,0,0);

    let mainWindow = wMediator.getMostRecentWindow("navigator:browser");
    if (mainWindow.BrowserApp) {
      mainWindow.BrowserApp.deck.addEventListener(EVENT_SEND, handleSend, true, true);
    } else {
      mainWindow.gBrowser.addEventListener(EVENT_SEND, handleSend, true, true);
    }

    let evt = doc.createEvent('CustomEvent');
    evt.initCustomEvent(EVENT_SETUP,true,false,{});
    doc.dispatchEvent(evt);

    let intervalID = timers.setInterval(function() {
      try{
        let evt = doc.createEvent('CustomEvent');
        evt.initCustomEvent(EVENT_HEARTBEAT,true,false,{});
        doc.dispatchEvent(evt);
      } catch (e) {
        timers.clearInterval(intervalID);
        trans.close(0);
        console.log("shutting down connection");
        try {
          mainWindow.BrowserApp.deck.removeEventListener(EVENT_SEND, handleSend);
        } catch (e) {}
      }
    },500);
  }
}

var doSetup = function() {
  let mainWindow = wMediator.getMostRecentWindow("navigator:browser");
  if (mainWindow.BrowserApp) {
    mainWindow.BrowserApp.deck.addEventListener(EVENT_CONNECT, handleSetup, true, true);
  } else {
    mainWindow.gBrowser.addEventListener(EVENT_CONNECT, handleSetup, true, true);
  }
};

doSetup();
