
var logs = true, disabled = {},
  gfw = 'http://www.greatfirewallofchina.org',
  triggers = new Set(['zhang+yannan', 'celestial+empire', 'grass+mud+horse', 'grassmudhorse', '草泥']),
  engines = ['^(www\.)*google\.((com\.|co\.|it\.)?([a-z]{2})|com)$', '^(www\.)*bing\.(com)$', 'search\.yahoo\.com$'],
  listUrl = 'https://raw.githubusercontent.com/dhowe/ChinaEye/master/sensitiveKeywords.txt';

chrome.runtime.onStartup.addListener(function () {
  getTriggersFromLocalStorage();
  updateCheck();
});

chrome.runtime.onInstalled.addListener(function () {
  loadListFromLocal(processList);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {

  //console.log('onUpdated', tabId, changeInfo, tab);
  if (changeInfo && changeInfo.status == "complete") {

    chrome.tabs.sendMessage(tabId, {
      what: 'tabUpdate',
      url: tab.url
    });

    if(tab.url === undefined){
      setIcon(tabId, "disabled");

    }
       
  }
});

/**************************** Messaging ******************************/


chrome.runtime.onMessage.addListener(function (request, sender, callback) {

  if (request.what === "checkPage") {

    //DIABLED
    //1.on disabled list
    //2.chrome page

    if (typeof disabled[sender.tab.id] !== 'undefined' || request.location.href.indexOf("chrome://") === 0) {

      // setTimeout(function () {
      //   delete disabled[sender.tab.id];
      // }, 5000); // remove after 5 seconds //why?

      setIcon(sender.tab.id, "disabled");

      callback && callback({
        status: 'disabled'
      });

      return;
    }

    var hostRegex = new RegExp(engines.join('|'), 'i'),
      keyvals = keysValues(request.location.href);

    keyword = keyvals.q || keyvals.p;

    if (keyword && keyword.length && hostRegex.test(request.location.host)) {

      var query = decodeURI(keyword.toLowerCase());

      if (query.indexOf(" ") > -1)
        query = query.replace(" ", "+");

      logs && console.log('search: ' + query);

      //for (var i = 0; i < triggers.length; i++) {
      for (let trigger of triggers) {

        if (query === trigger) {

          logs && console.log('block: ' + query);

          callback({
            status: 'block',
            trigger: query
          });

          setIcon(sender.tab.id, "blocked");

          return; // got one, we're done
        }
      }
    }

    // otherwise check with china servers
    checkPage(sender.tab, request.location.href, callback);

  } else if (request.what === "disablePage") { // from popup

    // add to disabled-tabId table
    disabled[request.tabId] = true;
    // and reload (will trigger content-script and be ignored)
    chrome.tabs.reload(request.tabId);

  } else if (request.what === "resumePage") {

    // remove from disabled-tabId table
    delete disabled[request.tabId];

    //reload the page
    chrome.tabs.reload(request.tabId);

  } else if (request.what === "isOnDisabledList") {

    if (typeof disabled[request.tabId] !== 'undefined') {

      callback && callback({
        status: 'disabled'
      });

    }
  }

  return true;

});

/**************************** functions ******************************/

function keysValues(href) {

  var vars = [],
    hashes = href.slice(href.indexOf('?') + 1).split(/&|\#/);

  for (var i = 0; i < hashes.length; i++) {
    var hash = hashes[i].split('=');

    vars.push(hash[0]);
    vars[hash[0]] = hash[1];
  }

  return vars;
}

var setIcon = function(tabId, iconStatus) {
   
    if ( tabId === 0 ) {
        return;
    }
    
    var onIconReady = function() {
        if ( chrome.runtime.lastError) {
            console.log(chrome.runtime.lastError.message);
            return;
        } else{
          //tab exists
        }
    };

    var iconPaths;

    switch(iconStatus) {
        case 'blocked':
            iconPaths = { '16': 'img/blocked16.png', '32': 'img/blocked32.png'};
            break;
        case 'disabled':
            iconPaths = { '16': 'img/disabled16.png', '32': 'img/disabled32.png'};
            break;
        default://on
            iconPaths = { '16': 'img/icon16.png', '32': 'img/icon32.png'};
    }
    // console.log(tabId, iconPaths);
    chrome.browserAction.setIcon({ tabId: tabId, path: iconPaths }, onIconReady);
};

/**************************** core ******************************/

var checkPage = function (tab, url, callback) {

  //chrome newtab
  if (url.indexOf("/chrome/newtab?") != -1) 
    url = url.split("/chrome/newtab?")[0];

   logs && console.log('checkPage:', url);

   var onSuccess = function (data) {
    var result = parseResults(data);
        setIcon(tab.id, result.status);
        return result;

   }

  $.ajax(gfw + '/index.php?siteurl=' + url, {
    success: function (data) {
      callback(onSuccess(data));
    },
    error: function (e) {
      callback({
        status: 'error',
        fails: -1
      });
      console.warn(e);
    }
  });
}


var parseResults = function (html) {

  var fails = 0, locs, vals, result = {};

  // remove img tags before calling find
  html = html.replace(/<img\b[^>]*>/ig, '');
  locs = $(html).find('.resultlocation');
  vals = $(html).find('.resultstatus');

  for (var i = 0; i < locs.length; i++) {

    var value = $(vals[i]).text().toLowerCase();
    result[$(locs[i]).text().toLowerCase()] = value;
    if (value === 'fail') fails++;
  }

  result.status = fails > 2 ? 'block' : 'allow';

  logs && console.log('result:', locs.length, vals.length, result);

  return result;
}

var downloadList = function (callback) {

  $.ajax({
    url: listUrl,
    type: 'get',
    success: function (data) {
      logs && console.log("Got list from: "  + listUrl + " " +  data.length);
      callback(data);
    },
    error: function (e) {
      callback && callback({
        status: 'error',
        fails: -1
      });
      console.warn(e);
    }
  });
}

var loadListFromLocal = function (callback) {

  $.ajax({
    url: chrome.runtime.getURL("sensitiveKeywords.txt"),
    type: 'get',
    success: function (data) {
      logs && console.log("Load list from Local: " + data.length + ' entries');
      callback(data);
    },
    error: function (e) {
      callback && callback({
        status: 'error',
        fails: -1
      });
      console.warn(e);
    }
  });
}

var updateCheck = function () {

  var lastCheckTime = chrome.storage.local.get('lastCheckTime', function (data) {

    logs && console.log("lastCheckTime", data.lastCheckTime);

    lastCheckTime = Date.parse(data.lastCheckTime);

    var currentTime = Date.now(),
      twelveHours = 5;

    if (currentTime - lastCheckTime < twelveHours) {

      logs && console.log("No need to update");

      return;

    } else {

      downloadList(processList);
    }
  });
}

var getTriggersFromLocalStorage = function (rules) {

  //if it returns null, loadFrom local copy
  chrome.storage.local.get('list', function (data) {
    if (data.list === undefined) loadListFromLocal(processList);
    else {
      logs && console.log("Get triggers from local storage: ",data.list);
      processTriggers(data.list);
    }
  });

}

var processTriggers = function (rules) {

  if (!rules || !rules.length) console.warn('Null rules', rules);

  for (var index in rules) {

    var rule = rules[index];

    if (typeof rule !== "string") continue;

    var keywords = rule.replace(/ /g, "+").split("|");

    if (isValid(keywords[0], triggers))
      triggers.add(keywords[0]);

    if (keywords.length > 1 && isValid(keywords[1], triggers))
      triggers.add(keywords[1]);
  }

  logs && console.log(triggers.size + ' triggers loaded/processed');
}

var isValid = function (trigger, list) {

  var ok = typeof trigger === 'string' && trigger.length;// && !list.contains(trigger);

  //if (!ok && logs) console.warn('Bad: "'+trigger+'"');

  return ok;
}

var processList = function (list) {

  var txtArr = list.split("\n"),
    time = new Date().toLocaleString();

  logs && console.log("Check time", time);

  var rules = txtArr.filter(function (line) {
    return /^(?!!|\[).*/.test(line)
  });

  logs && console.log("Example:", rules[1]);

  chrome.storage.local.set({
    list: rules
  });

  chrome.storage.local.set({
    lastCheckTime: time
  });

  processTriggers(rules);
}

/**************************** polyfill ******************************/

if (Array.prototype.contains instanceof Function === false) {

  Array.prototype.contains = function (a) {
    var b = this.length;
    while (b--) {
      if (this[b] === a) {
        return true;
      }
    }
    return false;
  };
}

if (String.prototype.startsWith instanceof Function === false) {
  String.prototype.startsWith = function (needle, pos) {
    if (typeof pos !== 'number') {
      pos = 0;
    }
    return this.lastIndexOf(needle, pos) === pos;
  };
}

if (String.prototype.endsWith instanceof Function === false) {
  String.prototype.endsWith = function (needle, pos) {
    if (typeof pos !== 'number') {
      pos = this.length;
    }
    pos -= needle.length;
    return this.indexOf(needle, pos) === pos;
  };
}

if (String.prototype.includes instanceof Function === false) {
  String.prototype.includes = function (needle, pos) {
    if (typeof pos !== 'number') {
      pos = 0;
    }
    if (start + search.length > this.length)
      return false;
    return this.indexOf(needle, pos) > -1;
  };
}
