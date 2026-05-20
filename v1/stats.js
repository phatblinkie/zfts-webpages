let myHeaders = new Headers();
	myHeaders;
	const myInit = {
	  method: 'GET',
	  headers: myHeaders,
	  mode: 'cors',
	  cache: 'default'
	};
fetch('../api/files',myInit)
    .then(response => response.json()) 
    .then(function (data){initialSetup(data)})
    .catch(function (err) {
        console.log('error: ' + err);
    });

//var intervalID = setInterval(function(){update()}, 2000);

function update() {
    let myHeaders = new Headers();
    myHeaders;
    const myInit = {
      method: 'GET',
      headers: myHeaders,
      mode: 'cors',
      cache: 'default'
    };
    fetch('../api/files',myInit)
        .then(response => response.json()) 
        .then(function (data) {
            let table = document.querySelector("table");
                generateTable(table, data["status"]);
        })
        .catch(function (err) {
            console.log('error: ' + err);
        });
}

function generateTableHead(table, data) {
	 let thead = table.createTHead();
	 let row = thead.insertRow();
	  for (let key of data) {
		 let th = document.createElement("th");
	     let text = document.createTextNode(key);
	     th.appendChild(text);
	     row.appendChild(th);
	  }
};
function generateTable(table, data) {
    
	for (let element of data) {
	    //first check and see if we can update
	    var rowLength = table.rows.length;
	    var found = false;
	    for (var i = 0; i < rowLength; i++) {
	         //gets cells of current row
	         var oCells = table.rows.item(i).cells;
	        
	         //gets amount of cells of current row
	         var cellLength = oCells.length;
	        
	         if(oCells.item(0).innerHTML == element["fileID"]) {
	             found = true;
	             //we found a match
	             if(element["started"] == 1) {
	                 oCells.item(2).innerHTML = "Started";
	             } else {
	                 oCells.item(2).innerHTML = "Stopped";
	             }
//	             oCells.item(3).innerHTML = element["priority"];
	             oCells.item(3).innerHTML = element["percent_complete"].toFixed(2).toString() + "%";
	             oCells.item(4).innerHTML = getRateText(element["rate"]);
	             oCells.item(5).innerHTML = getReaminingTimeFromRecord(element);
	             let sel = document.getElementById("priSelect"+ element["fileID"]);
	             sel.options[element["priority"]-1].selected = true;
	         }
	    }
	    if(!found) { //if not found add new row
            let row = table.insertRow();
        	
            let fidCell = row.insertCell();
        	let fidText = document.createTextNode(element["fileID"]);
        	fidCell.appendChild(fidText);
        	
        	let fnCell = row.insertCell();
            let fnText = document.createTextNode(element["file_name"]);
            fnCell.appendChild(fnText);
            
            let stateCell = row.insertCell();
            if(element["started"] == 1)
            {
                stateText = document.createTextNode("Started");
                stateCell.appendChild(stateText);
            } 
            else {
                let stateText = document.createTextNode("Stopped");
                stateCell.appendChild(stateText);
            }
            
//            let priCell = row.insertCell();
//            let priText = document.createTextNode(element["priority"]);
//            priCell.appendChild(priText);
            
            let pctCell = row.insertCell();
            let pctText = document.createTextNode(element["percent_complete"].toFixed(2).toString() + " %");
            pctCell.appendChild(pctText);
            
            let rateCell = row.insertCell();
            let rateText = document.createTextNode(getRateText(element["rate"]));
            rateCell.appendChild(rateText);
            
            let timeCell = row.insertCell();
            let timeText = document.createTextNode("");
            timeText.innerHTML = getReaminingTimeFromRecord(element);
            timeCell.appendChild(timeText);
            timeCell.innerHTML = getReaminingTimeFromRecord(element);
            
            let newPriCell = row.insertCell();
            var newPriElem = document.createElement("select");
            newPriElem.setAttribute("id" , "priSelect" + element["fileID"]);
            for(var i = 1; i<= 5;i++){
                var dropOption = document.createElement("option");
                dropOption.value = i;
                dropOption.text = i;
                if(i == element["priority"]) {
                    dropOption.selected = true;
                }
                newPriElem.add(dropOption);
            }
            newPriElem.onchange = (function(element) {return function() {startTransfer(element);}})(element);
            newPriCell.appendChild(newPriElem);
            
            var btn = document.createElement('input');
            btn.setAttribute("type", "button");
            btn.setAttribute("value","Start");
            btn.onclick = (function(element) {return function() {startTransfer(element);}})(element);
            let startCell = row.insertCell();
            startCell.appendChild(btn);
            
            var btn = document.createElement('input');
            btn.setAttribute("type", "button");
            btn.setAttribute("value","Stop");
            btn.onclick = (function(element) {return function() {stopTransfer(element,0);}})(element);
            //let stopCell = row.insertCell();
            startCell.appendChild(btn);
            
            var btn = document.createElement('input');
            btn.setAttribute("type", "button");
            btn.setAttribute("value","Cancel");
            btn.onclick = (function(element) {return function() {stopTransfer(element,1);}})(element);
            //let cancelCell = row.insertCell();
            startCell.appendChild(btn);
            
        }
	}
	//now remove any rows that are gone
    var rowLength = table.rows.length;
    var toRemove = [];
    for (var i = 1; i < rowLength; i++) {
        //gets cells of current row
        var oCells = table.rows.item(i).cells;
       
        //gets amount of cells of current row
        var cellLength = oCells.length;
        var found = false;
        for (let element of data) {
            if(oCells.item(0).innerHTML == element["fileID"]) {
                found = true;
                break;
            }
        }
        if(!found) {
            toRemove.push(i);
        }
   }
    for(let idx = toRemove.length-1; idx >= 0; idx--) {
        table.deleteRow(toRemove[idx]);
    }
}


async function startTransfer(element) {
    let url = "../api/files/"+element["fileID"];
    let optElm = document.getElementById("priSelect"+ element["fileID"]);
    let newPri = parseInt(optElm.options[optElm.selectedIndex].value);
    let data = {"started":"true","priority":newPri};
    const response = await fetch(url, {
        method: 'POST', // *GET, POST, PUT, DELETE, etc.
        mode: 'cors',
        cache: 'no-cache', 
        credentials: 'same-origin', 
        headers: {
          'Content-Type': 'application/json'
        },
        redirect: 'follow',
        referrerPolicy: 'no-referrer', 
        body: JSON.stringify(data)
      });
    update();
}

async function stopTransfer(element, cancel) {
    let url = "../api/files/"+element["fileID"];
    let data = {"started":"false","cancel":"false"};
    if(cancel == 1) {
        data = {"started":"false","cancel":"true"};
    }
    const response = await fetch(url, {
        method: 'POST', // *GET, POST, PUT, DELETE, etc.
        mode: 'cors',
        cache: 'no-cache', 
        credentials: 'same-origin', 
        headers: {
          'Content-Type': 'application/json'
        },
        redirect: 'follow',
        referrerPolicy: 'no-referrer', 
        body: JSON.stringify(data)
      });
    update();
}

function initialSetup(data) {
	let table = document.querySelector("table");
	if(data.hasOwnProperty("platform_name")){
	    document.title = data["platform_name"] +" File Transfer Service";
	    document.getElementById("header1").innerText = data["platform_name"] +" File Transfer Status";
	}
	else {
	    document.title = "File Transfer Service";
	}
	let dkeys = ["FileID","File Name","State", /*"Priority",*/"Complete (%)","Transfer Rate", "Time remaining","Priority", "Actions"]
    generateTableHead(table, dkeys);
	if (data["status"].length > 0) {
		generateTable(table, data["status"]);
	}
	
	 if(typeof(EventSource) !== "undefined")
     {
	     const evtSource = new EventSource("../api/files.sse");
	     evtSource.addEventListener("status",function(event) { 
	         let data = JSON.parse(event.data);
	         generateTable(table, data["status"]);
	     },false);
     } else {
         //if no events do polling
         var intervalID = setInterval(function(){update()}, 2000);
     }
	
};

function getRateText(rate) {
    let ret = "";
    if(rate/1e9 > 1) {
        //do GB/s
        ret = (rate/1e9).toFixed(3).toString(10) + " GB/s";
    } else if (rate/1e6 > 1) {
        //do MB/s
        ret = (rate/1e6).toFixed(3).toString(10) + " MB/s";
    } else if (rate/1e3 > 1) {
        //do KB/s
        ret = (rate/1e3).toFixed(3).toString(10) + " KB/s";
    } else {
        //do B/s
        ret = (rate).toFixed(3).toString(10) + " B/s";
    }
    return ret;
}
function getReaminingTimeFromRecord(dataElement)
{
    if(dataElement["rate"] == 0){
        return "&#8734";
    }
    let secs =  (dataElement["file_size"] - dataElement["bytes_received"])/ dataElement["rate"];
    var date = new Date(null);
    date.setSeconds(secs); 
    var result = date.toISOString().substr(11, 8);
    return result;
}

