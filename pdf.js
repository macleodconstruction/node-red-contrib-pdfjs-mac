module.exports = function(RED) {
	const fs = require('fs');
	const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
	
    function pdfOutNode(config)
	{
		RED.nodes.createNode(this, config);
		var node = this;
		node.filename = config.filename || "";
		node.sortByX = config.sortByX || false;
		node.sortByY = config.sortByY || false;
		node.combineRow = config.combineRow || false;
		node.combineColumn = config.combineColumn || false;
		// return a sorting function depending on what is being sorted
		function getSortFunction() {
			if(node.sortByX && node.sortByY) {
				return function sortByReverseYThenX(a, b) {
					if(a.transform[5] > b.transform[5]) { 
						return -1; 
					} 
					else if(a.transform[5] < b.transform[5]) { 
						return 1; 
					} 
					else { 
						return a.transform[4]-b.transform[4]; 
					} 
				};
			}
			if(node.sortByX) {
				return function sortByX(a, b) {return a.transform[4]-b.transform[4]};
			}
			if(node.sortByY) {
				return function sortByReverseY(a, b) {return b.transform[5]-a.transform[5]};
			}
		}
		// given text content, combine depending on if combining
		function combineFunction(textContent){
			var pageText = [];
			textContent.forEach((el, index) => {
				// if there was a previous element, we are looking to combine strings with similar x and y's and 
				if(index) {
					if((node.combineColumn && el.transform[4] === pageText[pageText.length-1].x) || 
					   (node.combineRow && el.transform[5] === pageText[pageText.length-1].y)) {
						pageText[pageText.length-1].t += " " + el.str.trim();
					}
					else {
						pageText.push({'p': index, 'x': el.transform[4], 'y': el.transform[5], 't': el.str.trim()});
					}
				}
				else {
					pageText.push({'p': index, 'x': el.transform[4], 'y': el.transform[5], 't': el.str.trim()});
				}
			});
			return pageText;
		}
		// for each pageNum, get the pages text content, then sort and merge text.
		async function loadPage(doc, pageNum) {
			return doc.getPage(pageNum)
			.then((page) => page.getTextContent())
			.then((content) => {
				if(node.sortByX || node.sortByY) {
					return content.items.sort(getSortFunction());
				}
				return content.items;
			})
			.then((textContent) => combineFunction(textContent));
		};
		
		// create an array of pagenumbers and loop over from 1...n
		async function retrievePdfTextContent(doc)
		{
			var numPages = doc.numPages;
			// get array of pages from [1..numPages];
			var pages = Array.from(Array(numPages),(el, index) => index+1);
			// loop over each promise and retrieve each page's text content in the pdf
			let resolvedArray = await Promise.all(pages.map(async(value) => loadPage(doc, value)));
			return resolvedArray;
		}
		node.on('input', function(msg)
		{
			// if there is content in the payload to read from or a filename provided in config, continue
			// can be either pdf binary data or a path to the pdf
			let target = msg.payload || node.filename;
			if(target) {
				// load the pdf
				var loadingTask = pdfjsLib.getDocument(target);
				loadingTask.promise.then((doc) => retrievePdfTextContent(doc))
				.then((pageArray) => {
					msg.payload = pageArray;
					node.send(msg);
				})  
				.catch(err => {
					msg.payload = err;
					node.send([null, msg]);
				});
			}
			else {
				msg.payload = "MissingFieldError: Missing msg.payload / filename, please provide a path to a pdf file in the payload/filename or the pdf file contents in the payload.";
				node.send([null, msg]);
			}
		});
	}
	RED.nodes.registerType("pdf", pdfOutNode);
}
