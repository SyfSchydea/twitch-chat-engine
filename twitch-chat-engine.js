(() => {
	const NOOP = () => undefined;
	
	// Simple assertion, throws an error if the first parameter is falsey
	function assert(condition, errorMessage="") {
		if (!condition) {
			throw new Error(errorMessage);
		}
	}
	
	// Abstract class to determine which messages trigger a listener
	class ListenerTrigger {
		// Return a ListenerTrigger which matches when both this and that match
		and(that) {
			// If either is a NoMessagesTrigger, the conjuction can never return true
			if (this instanceof NoMessagesTrigger || that instanceof NoMessagesTrigger) {
				return new NoMessagesTrigger();
			}
			
			// If either is an AllMessagesTrigger, the conjuction will function the same as the other parameter
			if (this instanceof AllMessagesTrigger) {
				return that;
			}
			if (that instanceof AllMessagesTrigger) {
				return this;
			}
			
			// If the parameters are the same, just return itself
			if (this === that) {
				return this;
			}
			
			return new ConjunctionTrigger([this, that]);
		}
		
		// Return a ListenerTrigger which matches when either this or that match
		or(that) {
			// If either is an AllMessagesTrigger, the disjunction can never return false
			if (this instanceof AllMessagesTrigger || that instanceof AllMessagesTrigger) {
				return new AllMessagesTrigger();
			}
			
			// If either is a NoMessagesTrigger, the disjunction will function the same as the other parameter
			if (this instanceof NoMessagesTrigger) {
				return that;
			}
			if (that instanceof NoMessagesTrigger) {
				return this;
			}
			
			// If the parameters are the same, just return itself
			if (this === that) {
				return this;
			}
			
			return new DisjunctionTrigger([this, that]);
		}
	}
	
	// Matches all messages
	class AllMessagesTrigger extends ListenerTrigger {
		matches(msgDetails) {
			return true;
		}
	}
	
	// Matches no messages
	class NoMessagesTrigger extends ListenerTrigger {
		matches(msgDetails) {
			return false;
		}
	}
	
	// Matches when the text of the message matches a given regex
	class TextRegexTrigger extends ListenerTrigger {
		constructor(regex) {
			super();
			this.regex = regex;
		}
		
		matches(msgDetails) {
			return this.regex.test(msgDetails.text);
		}
	}
	
	// Matches when the message uses a specific emote
	class EmoteTrigger extends ListenerTrigger {
		constructor(emoteName) {
			super();
			this.emote = emoteName;
		}
		
		matches(msgDetails) {
			return msgDetails.emotes.includes(this.emote);
		}
	}
	
	// Matches when the message uses an emote which matches a regex
	class EmoteRegexTrigger extends ListenerTrigger {
		constructor(regex) {
			super();
			this.regex = regex;
		}
		
		matches(msgDetails) {
			for (let emote of msgDetails.emotes) {
				if (this.regex.test(emote)) {
					return true;
				}
			}
			
			return false;
		}
	}
	
	// Matches when the message cheers N or more bits
	class BitsTrigger extends ListenerTrigger {
		constructor(threshold) {
			super();
			this.bitsThreshold = threshold;
		}
		
		matches(msgDetails) {
			return msgDetails.bits >= this.bitsThreshold;
		}
	}
	
	// Matches when a specific user is mentioned
	class MentionTrigger extends ListenerTrigger {
		constructor(user) {
			super();
			this.user = user;
		}
		
		matches(msgDetails) {
			return msgDetails.mentions.includes(this.user);
		}
	}
	
	// Matches when a message consists only of emotes
	class EmoteOnlyTrigger extends ListenerTrigger {
		matches(msgDetails) {
			// Must contain at least one emote or cheer emote
			if (msgDetails.emotes.length <= 0 && msgDetails.bits <= 0) {
				return false;
			}
			
			// Must contain no text other than whitespace
			return !/[^\s]/.test(msgDetails.textWithoutEmotes);
		}
	}
	
	// Matches when all of two or more other triggers also match
	class ConjunctionTrigger extends ListenerTrigger {
		constructor(triggers) {
			super();
			this.children = triggers;
		}
		
		matches(msgDetails) {
			for (let child of this.children) {
				if (!child.matches(msgDetails)) {
					return false;
				}
			}
			
			return true;
		}
	}
	
	// Matches when any of two or more other triggers also match
	class DisjunctionTrigger extends ListenerTrigger {
		constructor(triggers) {
			super();
			this.children = triggers;
		}
		
		matches(msgDetails) {
			for (let child of this.children) {
				if (child.matches(msgDetails)) {
					return true;
				}
			}
			
			return false;
		}
	}
	
	// Listener for chat messages
	// trigger should be a ListenerTrigger object
	// response functions should take the details object returned by ChatBot.getDetails 
	// ({text, emotes, mentions, bits}), and the message itself
	class MessageListener {
		constructor(trigger, responseFunction) {
			this.trigger = trigger;
			this.response = responseFunction;
		}
		
		handle(msgDetails, message) {
			if (this.trigger.matches(msgDetails)) {
				this.response(msgDetails, message);
			}
		}
	}
	
	class ChatBot {
		constructor(prefix="bot", tickInterval=1000) {
			let identifierPrefix = prefix + "--";
			this.seenMessageAttribute = identifierPrefix + "seen";
			
			this.tickInterval = tickInterval;
			
			this.messageListeners = [];
			this.onEachLoop = NOOP;
			
			this.intervalId = null;
		}
		
		// Checks if the given chat message has been marked as "seen"
		seenMessage(msg) {
			return msg.getAttribute(this.seenMessageAttribute) != null;
		}
		
		// Marks the given message as being "seen"
		setSeen(msg) {
			msg.setAttribute(this.seenMessageAttribute, "true");
		}
		
		// Returns a list of all messages which have not been previously seen, and marks them as being seen
		// This function does not currently return some non-user messages such as:
		// .reward-gift-user-notice - ${user}'s Cheer shared rewards to ${some} others in chat.
		// sub messages?
		// sub gifts?
		getUnseenMessages() {
			let unseenMessages = Array.from(document.querySelectorAll(`.chat-line__message:not([${this.seenMessageAttribute}])`));
			
			for (let msg of unseenMessages) {
				this.setSeen(msg);
			}
			
			return unseenMessages;
		}

		// Add a message listener to this bot
		// May either pass a regex and callback, or pass a message listener directly
		addMessageListener(param1, param2) {
			let listener;
			
			// addMessageListener(trigger, responseFunction)
			if (param1 instanceof ListenerTrigger && typeof param2 == "function") {
				let trigger = param1;
				let responseFunction = param2;
				
				listener = new MessageListener(trigger, responseFunction);
			} else if (param1 instanceof MessageListener && param2 === undefined) {
				listener = param1;
			} else {
				throw new Error(`Invalid parameters to addMessageListener: ${[...arguments]}`);
			}
			
			// If the listener can never trigger, don't bother adding it
			if (listener.trigger instanceof NoMessagesTrigger) {
				return;
			}
			
			this.messageListeners.push(listener);
		}
		
		setEachLoopCallback(callback) {
			this.onEachLoop = callback;
		}
		
		handleMessage(msg) {
			let msgDetails = ChatBot.getDetails(msg);
			
			for (let listener of this.messageListeners) {
				listener.handle(msgDetails, msg);
			}
		}
		
		tick() {
			let messages = this.getUnseenMessages();
			
			// check for listeners which match each message, call them if they do
			for (let msg of messages) {
				this.handleMessage(msg);
			}
			
			this.onEachLoop();
		}
		
		setTickInterval(interval) {
			this.tickInterval = interval;
			
			if (this.isRunning()) {
				this.stop();
				this.start();
			}
		}
		
		isRunning() {
			return this.intervalId != null;
		}
		
		stop() {
			if (!this.isRunning()) {
				return;
			}
			
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		
		start() {
			if (this.isRunning()) {
				return;
			}
			
			// If there are no listeners, don't bother running
			if (this.messageListeners.length <= 0) {
				return;
			}
			
			// bind tick to ensure it is called with the correct reference for 'this'
			let tick = this.tick.bind(this);
			
			this.intervalId = setInterval(tick, this.tickInterval);
		}
		
		// Returns the raw text of a message, and info on emotes etc.
		// TODO: parse badges (seperate function?)
		// TODO: fetch username
		static getDetails(msg) {
			let elements = Array.from(msg.querySelectorAll(".message > *"));
			
			let messageText = "";
			let textWithoutEmotes = "";
			let emotes = [];
			let usersMentioned = [];
			let bits = 0;
			
			for (let element of elements) {
				let classList = element.classList;
				
				if (element.getAttribute("data-a-target") == "chat-message-text") {
					// Standard Text
					let text = element.textContent;
					
					messageText += text;
					textWithoutEmotes += text;
					
					continue;
				}
				
				if (classList.contains("chat-line__message-mention")) {
					// Mentions eg. @so_and_so
					let mentionText = element.textContent;
					
					let match = mentionText.match(/^@(.*)$/);
					assert(match, `Mention text did not match expected format: "${mentionText}"`);
					let userMentioned = match[1];
					
					messageText += mentionText;
					textWithoutEmotes += mentionText;
					
					usersMentioned.push(userMentioned);
					
					continue;
				}
				
				if (element.getAttribute("data-a-target") == "emote-name") {
					// Emote
					let img = element.querySelector("img.chat-image");
					assert(img, "Could not find img tag in emote span");
					
					let emoteName = img.alt;
					
					messageText += emoteName;
					emotes.push(emoteName);
					
					continue;
				}
				
				if (classList.contains("chat-line__message--emote") || classList.contains("ffz-cheer")) {
					// Text is stored in the "alt" attribute, but this is not standard on a span tag, so we must fetch it with getAttribute
					messageText += element.getAttribute("alt");
					
					// Cheer/Bits - return emote code
					let amountText = element.getAttribute("data-amount");
					assert(amountText != undefined, "Failed to find cheer amount");
					
					// Cheer amounts above 999 have commas in them eg. 1,000
					// Remove them so we can parse them correctly
					amountText = amountText.replace(/,/g, "");
					
					assert(amountText.match(/^\d+$/), `Cheer amount was not numeric: "${amountText}"`);
					let amount = +amountText;
					
					bits += amount;
					
					continue;
				}
				
				if (element.getAttribute("data-tooltip-type") == "link") {
					// Link
					// TODO? list of links
					
					let text = element.textContent;
					
					messageText += text;
					textWithoutEmotes += text;
					
					continue;
				}
				
				// Throw an error if none of the other blocks match
				console.error("Unknown message component", element);
				throw new Error("Unknown message component");
			}
			
			return {
				text: messageText,
				textWithoutEmotes, 
				emotes,
				mentions: usersMentioned,
				bits,
			};
		}
		
		// Finds the name of the user who sent the given message
		static getUsername(msg) {
			return msg.getAttribute("data-user");
		}
	}
	
	// Sends the given text to the chat
	// TODO: This seems to have some issues. I'm guessing that sending 
	// a message happens asynchronously, so overwriting the box's 
	// contents after clicking the button doesn't work properly.
	// function sendMessage(text) {
		// throw new Error("sendMessage is not currently implemented");
		
		// let inputBox = document.querySelector(".chat-input textarea");
		// assert(inputBox, "Failed to find chat input box");
		
		// let sendButton = document.querySelector("button[data-a-target='chat-send-button']");
		// assert(sendButton, "Failed to find send chat button");
		
		// let prevText = inputBox.value;
		
		// inputBox.value = text;
		// sendButton.click();
		
		// inputBox.value = prevText;
	// }
})();