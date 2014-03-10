const {interfaces: Ci, utils: Cu, classes: Cc} = Components;
const self = {
	name: 'DragControl',
	contentPath: 'chrome://dragcontrol/content/',
	aData: 0,
};

Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/devtools/Console.jsm');

var addedHandlers = [];

function dragHandler(DOMWin) {
	this.win = DOMWin;
	this.doc = DOMWin.document;
	this.gBrowser = DOMWin.gBrowser;
	if (!this.gBrowser) {
		this.gBrowser = null;
	}
	this.controlPanel = createControlPanel(DOMWin);

	for (var l in this.controlPanelEventListeners) {
		this.controlPanel.addEventListener(l, this.controlPanelEventListeners[l].bind(this), false);
	}
	
	if (this.gBrowser) {
		for (var l in this.eventListeners) {
			this.gBrowser.addEventListener(l, this.eventListeners[l].bind(this), false);
		}
	} else {
		//no gBrowser
		for (var l in this.eventListeners) {
			this.win.addEventListener(l, this.eventListeners[l].bind(this), false);
		}
	}
	
	console.log(self.name + ' :: ', 'done init');
}

dragHandler.prototype.destroy = function() {
	this.controlPanel.parentNode.removeChild(this.controlPanel);
	if (this.gBrowser) {
		for (var l in this.eventListeners) {
			this.gBrowser.removeEventListener(l, this.eventListeners[l], false);
		}
	} else {
		//no gBrowser
		for (var l in this.eventListeners) {
			this.win.removeEventListener(l, this.eventListeners[l], false);
		}
	}
}

dragHandler.prototype.eventListeners = {
	dragstart: function(e) {
		parseDragStartEvent.bind(this, e);
		if (this.gBrowser) {
			this.controlPanel.openPopup(this.gBrowser, 'overlap', 0, 0);
		} else {
			this.controlPanel.openPopup(this.doc.documentElement, 'overlap', 0, 0);
		}
	},
	dragend: function(e) {
	
	},
	dragover: function(e) {
	
	},
	drop: function(e) {
	
	},
	dragend: function(e) {
		this.controlPanel.hidePopup();
	}
};

function parseDragStartEvent(evt) {
	let d = {};
	let dt = evt.dataTransfer;
	let el = evt.target;
	if (el.nodeType == 3) {
		// text node ('nodeName' == '#text')
		// looks like:
		//  1. the el.textContent is the content of the element being dragged, not the selection.
		//  2. it only happens when you drag the selection
		// console.log(el.textContent);
	}

	let data = dt.getData('text/plain');
	data = trim(data);
	if (data != '') {
		d['text'] = data;
		d['primaryKey'] = 'text';
	}

	if (evt.explicitOriginalTarget && evt.explicitOriginalTarget.tagName == 'IMG') {
		d['image'] = evt.explicitOriginalTarget.src;
		if (d['image'] != '') {
			d['primaryKey'] = 'image';
		}
	}

	data = dt.getData('text/uri-list');
	if (data === '') {
		// still try to get a link
		let a = el;
		while (a) {
			if (a.tagName == 'A') {
				data = a.href;
				break;
			}
			a = a.parentNode;
		}
	}
	if (data !== '' && isLinkSupported(data)) {
		d['link'] = data;
		if (el.nodeType == 1 && el.tagName == 'A') {
			d['primaryKey'] = 'link';

			// TODO: shoud we do this?
			let text = el.textContent;
			text = trim(text);
			if (text == '') {
				delete d['text'];
			} else {
				d['text'] = text;
			}
		}
	}

	// selection(s)
	let sel = evt.target.ownerDocument.defaultView.getSelection();
	sel = sel.toString();
	sel = trim(sel);
	if (sel != '') {
		d['selection'] = sel;

		if (el.nodeType == 3 && el.nodeName == '#text') { // if the user is dragging the selected text, it will be the primaryKey.
			d['primaryKey'] = 'selection';
		}

	}

	// if user selected something, or if there is no link,
	// we'll check whether the text itself is a link
	let text = d['selection'] || (d['link'] ? null : d['text']);
	if (text) {
		text = trim(text);
		if (text && isURL(text)) {
			d['link'] = text;
			d['primaryKey'] = 'link';
		}
	}


	if (d['primaryKey'] === undefined) {
		return null;
	}

	d['DOMWin'] = this.DOMWin;
	d['gBrowser'] = this.DOMWin.gBrowser;

	return d;
}

function createControlPanel(win) {
	var mainPopupSet = win.document.querySelector('#mainPopupSet');
	if (!mainPopupSet) {
		mainPopupSet = win.document.documentElement;
	}
	
	var panel = win.document.createElement('panel');
	var props = {
		id: 'dragcontrol-control-panel',
		noautohide: true,
		noautofocus: false,
		level: 'parent',
		style: 'padding:15px; margin:0; width:300px; height:300px; background-color:transparent; border:0; -moz-appearance:none !important;'
	}
	for (var p in props) {
		panel.setAttribute(p, props[p]);
	}
	 
	var iframe = win.document.createElement('iframe');
	iframe.setAttribute('style','border:0; background-color:rgba(255,255,255,.95); ;margin:0; padding:0; width:300px; height:300px; box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3); border-radius:10px;');
	iframe.setAttribute('src', self.contentPath + 'control-panel/index.htm');
	panel.appendChild(iframe);
	 
	mainPopupSet.appendChild(panel);
	
	return panel;
	//panel.openPopup(null, 'overlap', screen.availLeft, screen.availTop);
}

/*start - windowlistener*/
var windowListener = {
	//DO NOT EDIT HERE
	onOpenWindow: function (aXULWindow) {
		// Wait for the window to finish loading
		let aDOMWindow = aXULWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
		aDOMWindow.addEventListener("load", function () {
			aDOMWindow.removeEventListener("load", arguments.callee, false);
			windowListener.loadIntoWindow(aDOMWindow, aXULWindow);
		}, false);
	},
	onCloseWindow: function (aXULWindow) {},
	onWindowTitleChange: function (aXULWindow, aNewTitle) {},
	register: function () {
		// Load into any existing windows
		let XULWindows = Services.wm.getXULWindowEnumerator(null);
		while (XULWindows.hasMoreElements()) {
			let aXULWindow = XULWindows.getNext();
			let aDOMWindow = aXULWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
			windowListener.loadIntoWindow(aDOMWindow, aXULWindow);
		}
		// Listen to new windows
		Services.wm.addListener(windowListener);
	},
	unregister: function () {
		// Unload from any existing windows
		let XULWindows = Services.wm.getXULWindowEnumerator(null);
		while (XULWindows.hasMoreElements()) {
			let aXULWindow = XULWindows.getNext();
			let aDOMWindow = aXULWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
			windowListener.unloadFromWindow(aDOMWindow, aXULWindow);
		}
		//Stop listening so future added windows dont get this attached
		Services.wm.removeListener(windowListener);
		
		[].forEach.call(addedHandlers, function(handler) {
			//need to check if window (handler[0]) is open BUT for now im just doing try catch
			try {
				handler[1].destroy();
			} catch(ex) {
				console().warn('exception while destroying',ex);
			}
		});
	},
	//END - DO NOT EDIT HERE
	loadIntoWindow: function (aDOMWindow, aXULWindow) {
		if (!aDOMWindow) {
			return;
		}
		var handler = new dragHandler(aDOMWindow);
		addedHandlers.push([aDOMWindow, handler]);
		
	},
	unloadFromWindow: function (aDOMWindow, aXULWindow) {
		if (!aDOMWindow) {
			return;
		}
	}
};
/*end - windowlistener*/
function startup(aData, aReason) {
	//self.aData = aData; //must go first, because functions in loadIntoWindow use self.aData
	windowListener.register();
}

function shutdown(aData, aReason) {
	if (aReason == APP_SHUTDOWN) return;
	windowListener.unregister();
}

function install() {}

function uninstall() {}