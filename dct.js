// This code based on the Dealer API script from Keith Curtis.  Original here: https://github.com/keithcurtis1/Dealer
// card API reference: https://app.roll20.net/forum/post/6223396/api-updates-3-slash-27-slash-2018
// and example here:  https://app.roll20.net/forum/post/8461353/rotating-a-card-on-placement-to-table
// post saying playCardToTable is broke since sept 1 2019: https://app.roll20.net/forum/post/8423978/manipulating-multiple-cards-or-decks-at-once
// Last Updated: 9/12/2021
//
// A script to deal cards to players and GMs
//
// New Syntax is !DealCardsTo --[number of cards as integer]|[deck name]|[player name|TO-TABLE] ... --[num|deck|who] ...
//
// !DealCardsTo --7|New Chase|TO-TABLE --2|New Chase|kevin --1|New Chase|Kailani --2|New Chase|Nathan
//
// Trick from Aaron to fix "Syntax Error: Unexpected Identifier" - put a ";" at top of script
// The API Server concatenates all the scripts together, which can lead to code that isn't
// correct when a programmer relies on automatic semicolon insertion.
;

/*
  _                        _ ___   ___
 / \    _|_  _  ._    /\  |_) |     | ._ _. ._
 \_/ |_| |_ (/_ |    /--\ |  _|_    | | (_| |_)
                                            |
*/

on('ready', () => {
    const version = '1.1.0';  // script version
    log('-=> DealCardsTo v' + version + ' <=-');

    /*
      _                                _
     |_    ._   _ _|_ o  _  ._   _   _|_ ._ _  ._ _     /\   _. ._ _  ._
     | |_| | | (_  |_ | (_) | | _>    |  | (_) | | |   /--\ (_| | (_) | |

     from Aaron's post on how to fix playToTable: https://app.roll20.net/forum/post/7583610/slug%7D#post-7595323
    */
      
    const isCleanImgsrc = (imgsrc) => /(.*\/images\/.*)(thumb|med|original|max)([^?]*)(\?[^?]+)?$/.test(imgsrc);
  
  	const getCleanImgsrc = (imgsrc) => {
  		let parts = imgsrc.match(/(.*\/images\/.*)(thumb|med|original|max)([^?]*)(\?[^?]+)?$/);
  		if(parts) {
  			return parts[1]+'thumb'+parts[3]+(parts[4]?parts[4]:`?${Math.round(Math.random()*9999999)}`);
  		}
  		return;
  	};
  	
    const getPageForPlayer = (playerid) => {
        let player = getObj('player',playerid);
        if(playerIsGM(playerid)){
            return player.get('lastpage');
        }

        let psp = Campaign().get('playerspecificpages');
        if(psp[playerid]){
            return psp[playerid];
        }

        return Campaign().get('playerpageid');
    };
    const getLocations = (pageid) => findObjs({type:'graphic', pageid})
        .filter(g=>/^card:/i.test(g.get('name')))
        .reduce( (m,l) => (m[l.get('name').replace(/^card:/i,'')]=l) && m, {});
    
    
    const fixedPlayCardToTable = (cardid, options) => {
        let card = getObj('card',cardid);
        if(card){
            let deck = getObj('deck',card.get('deckid'));
            if(deck){
                if(!isCleanImgsrc(deck.get('avatar')) && !isCleanImgsrc(card.get('avatar'))){
                    // marketplace-marketplace:
                    playCardToTable(cardid, options);
                } else if (isCleanImgsrc(deck.get('avatar')) && isCleanImgsrc(card.get('avatar'))){
                    let pageid = options.pageid || Campaign().get('playerpageid');
                    let page = getObj('page',pageid);
                    if(page){

                        let imgs=[getCleanImgsrc(card.get('avatar')),getCleanImgsrc(deck.get('avatar'))];
                        let currentSide = options.hasOwnProperty('currentSide')
                            ? options.currentSide
                            : ('faceup' === deck.get('cardsplayed')
                                ? 0
                                : 1
                            );

                        let width = options.width || parseInt(deck.get('defaultwidth')) || 140;
                        let height = options.height || parseInt(deck.get('defaultheight')) || 210;
                        let left = options.left || (parseInt(page.get('width'))*70)/4;
                        let top = options.top || (parseInt(page.get('height'))*70)/1.5;

                        createObj( 'graphic', {
                            subtype: 'card',
                            cardid: card.id,
                            pageid: page.id,
                            currentSide: currentSide,
                            imgsrc: imgs[currentSide],
                            sides: imgs.map(i => encodeURIComponent(i)).join('|'),
                            left,top,width,height,
                            layer: 'objects',
                            isdrawing: true,
                            controlledby: 'all',
                            gmnotes: `cardid:${card.id}`
                        });
                    } else {
                        sendError('gm',`Specified pageid does not exists.`);
                    }
                } else {
                    sendError('gm',`Can't create cards for a deck mixing Marketplace and User Library images.`);
                }
            } else {
                sendError('gm',`Cannot find deck for card ${card.get('name')}`);
            }
        } else {
            sendError('gm',`Cannot find card for id ${cardid}`);
        }
    };



      /*
                              _ ___
       |\/|  _. o ._     /\  |_) |    |   _   _  ._
       |  | (_| | | |   /--\ |  _|_   |_ (_) (_) |_)
                                                 |
      */

      // main loop for the api script
      on('chat:message', (msg) => {
          if (('api' === msg.type) && (/!DealCardsTo/i.test(msg.content))) {
            //sendChat('DealCardsTo', '/w gm Command Line: ' + msg.content);

            //parse command line
            //
            // !DealCardsTo --7|New Chase|TO-TABLE --2|New Chase|kevin --1|New Chase|Kailani --2|New Chase|Nathan
            //

            const args = msg.content.split(/\s+--/);


            var numberChoice = 1;  // how many cards to deal
            var deckChoice = 'Playing Cards'; // what deck to deal from
            var playerChoice = 'GM';  // who to deal to
            var playerChoiceID = ''; // id of the chosen player (the who)
            var displayName = ''; // display name of the player (the who)
            var numDeckWho = []; // array for holding split of num|deck|who
            var argCount = args.length - 1;  // number of num|deck|who args to loop thru
            var objectID = '';  // stores object id's for get() api calls
            var dealToTable = 0; // 0 = deal to hand, 1 = deal to table

            // sendChat('DealCardsTo', '/w gm arg.length value: [' + args.length + ']');



            // malformed command line
            if ((args.length < 2) || (args[0] !== '!DealCardsTo')) {
              sendChat('DealCardsTo', '/w gm USAGE:: !DealCardsTo --[number of cards as integer]|[deck name]|[player name|TO-TABLE] ... --num|deck|who ... ');
              return;
            }
              
            do { // loop thru each num|deck|who arg
            
                // split num|deck|who arg by '|'
                numDeckWho = args[argCount].split(/\|/);
                
                // test for num|deck|who syntax
                if (numDeckWho.length !== 3 ) {
                  sendChat('DealCardsTo', '/w gm USAGE:: !DealCardsTo --[number of cards as integer]|[deck name]|[player name|TO-TABLE] ... --num|deck|who ... ');
                  return;
                }

                // how many cards to deal
                numberChoice = numDeckWho[0];
                numberChoice = Number((Number.isInteger(Number(numberChoice))) ? numberChoice : 1);
                // sendChat('DealCardsTo', '/w gm # Cards to Deal: [' + numberChoice + ']');
  
                // what deck to deal from
                deckChoice = numDeckWho[1] || 'Playing Cards';
                //sendChat('DealCardsTo', '/w gm Deck to Deal From: [' + deckChoice + ']');
  
                // who to deal to
                playerChoice = numDeckWho[2] || 'GM';

                //
                // get player id so we can deal to their hand
                //
                let players = findObjs({
                  _type: 'player'
                });
                playerChoiceID = '';
                displayName = '';
                objectID = '';
                dealToTable = 0;
                if (playerChoice !== 'TO-TABLE') {
                  _.each(players, function(obj) {
                    displayName = obj.get('displayname');
                    objectID = obj.get('id');
                    //sendChat('DealCardsTo', '/w gm Player Choice = [' + playerChoice + ']' );
                    //sendChat('DealCardsTo', '/w gm Player [' + displayName + '] has id: ' + objectID + ' String Match: ' + displayName.search( playerChoice ) );
                    if (displayName.search(playerChoice) > -1) {
                      playerChoiceID = objectID;
                    }
                  });
                  if (!playerChoiceID) {
                    sendChat('DealCardsTo', '/w gm ERROR:: Player Name: [' + playerChoice + '] not found!');
                    return;
                  }
                  else {
                    let playerIsOnline = (getObj('player', playerChoiceID) || {
                      get: () => {}
                    }).get('online');
                    if (!playerIsOnline) {
                      sendChat('DealCardsTo', '/w gm ERROR:: Player Name: [' + playerChoice + '] is Offline!');
                      return;
                    }
                  }
                } // end if dealing to Player
                else {
                  dealToTable = 1; // dealing to table
                }
                sendChat('DealCardsTo', '/w gm Dealing [' + numberChoice + '] card(s) from [' + deckChoice + '] deck to [' + playerChoice + ']');


                //
                // get the Id of deck from the deck name
                //
                let theDeck = findObjs({
                  _type: "deck",
                  name: deckChoice
                })[0];
  
                //
                //test if the deck exists
                //
                if (!theDeck) {
                  sendChat('DealCardsTo', '/w gm ERROR:: Deck: ' + deckChoice + '. not Found!  Check spelling and existence.');
                  return;
                }
  
                //
                // set the deck ID and deck card stack
                //
                let deckID = theDeck.id;
                let deckCards = theDeck.get('_currentDeck');
  
  
  
                //
                // this stuff needed for Aaron's fixedPlayCardToTable function
                //
                let who = (getObj('player',msg.playerid)||{get:()=>'API'}).get('_displayname');
                let pageid = getPageForPlayer(msg.playerid);
                let locs = getLocations(pageid);
                let opts = () => ({pageid});
                let o = opts();
                
                
                //
                // deal a single random card to player or the table
                //
                do { // loop thru the number of card to deal
  
                  //draw a card
                  let cardid = drawCard(deckID);
  
                  // if there are no cards left, shuffle discard pile and draw again
                  if (!cardid) {
                    shuffleDeck(deckID);
                    cardid = drawCard(deckID);
                  }

                  // if the deck is still empty, throw an error
                  if (!cardid) {
                    sendChat('DealCardsTo', '/w gm ERROR:: Deck: ' + deckChoice + '. is out of cards!');
                    return;
                  }
  
                  // give 1 card to the player or deal 1 to the table
                  if (dealToTable) {
                    // sendChat('DealCardsTo', '/w gm Dealing Cards to Table...');
                    // broken - see header:  playCardToTable(cardid, { currentSide: 0 } );
                    fixedPlayCardToTable(cardid, o);
                  }
                  else {
                    giveCardToPlayer(cardid, playerChoiceID);
                  }

                  // decrement the number of cards left to give
                  numberChoice--;
                  
                }  while (numberChoice > 0);  // end do-while cards left to give to a single player

                // decrement the number of num|deck|who args left to parse
                argCount--;
            
            } while (argCount > 0); // end do-while num|deck|who args left to parse
        
          } // end if api ...
      }); // end on message ...
}); // end on ready ...
