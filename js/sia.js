async function calculateCode(file) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const hashArray = Array.from(new Uint8Array(hashBuffer));  
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');  
    return hashHex;
}
  
document.addEventListener('DOMContentLoaded', function() {
    var fileInput = document.getElementById('fileInput');
    if (fileInput) {
      fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        processAllFiles(file);
      });
    } else {
      displayError('File input element not found.');
    }
  });
  
  async function processAllFiles(file) {
    document.getElementById('character-count').value = '';
    document.getElementById('textOutput').value = '';
    document.getElementById('success').style.display = 'none';
    document.getElementById('failure').style.display = 'none';
    document.getElementById('warning').style.display = 'none';
    document.getElementById('processingMessage').style.display = 'none';

    if (!file) {
        displayError('Unable to read file.');
        return;
    }
    if (/\.docx$/i.test(file.name)) {
        processDocx(file);
    } 
    else if (/\.pptx$/i.test(file.name)) {
        processPptxFile(file);
    }
    else if (/\.xlsx$/i.test(file.name)) {
        processXlsxFile(file);
    }
    else if (/\.pdf$/i.test(file.name)) {
        processPDFFile(file);
    }
    else if (/\.(txt|csv|py|json)$/i.test(file.name)) {
        processTextFile(file);
    }
    else {
        displayError('Please select a valid file type. We accept: *.docx, *.pptx, *.xlsx, *.txt, *.csv, *.py, *.json, *.pdf')
    }
  }

  async function processPDFFile(file) {
    const processingMessage = document.getElementById('processingMessage');
    processingMessage.style.display = 'block';
    const worker = await Tesseract.createWorker("eng");
    const originalHTML = processingMessage.innerHTML;
    var allText = '';
    var fileCharacterCount = 0;
    if (file.type === 'application/pdf') {
      const { numPages, imageIterator } = await convertPDFToImages(file);
      let done = 0;
      processingMessage.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Processing ${numPages} page${numPages > 1 ? 's' : ''}`;
      for await (const { imageURL } of imageIterator) {
        result = checkCharacterCount(fileCharacterCount);
        if ( result != "OK" ) break;
        const { text } = await ocrImage(worker, imageURL);
        allText += text;
        fileCharacterCount += text.length;
        document.getElementById('character-count').value = fileCharacterCount;
        done += 1;
        processingMessage.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Completed ${done} of ${numPages}`;
      }
    }
    else{
        displayError("Invalid PDF File.")
    } 
    await worker.terminate();
    processingMessage.innerHTML = originalHTML;
    processingMessage.style.display = 'none';
    document.getElementById('textOutput').value = allText.trim();
    document.getElementById('character-count').value = fileCharacterCount;
    checkFileSize(file, fileCharacterCount);
  }

async function convertPDFToImages(file) {
    const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
    const numPages = pdf.numPages;
    async function* images() {
      for (let i = 1; i <= numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          const desiredWidth = 1000;
          canvas.width = desiredWidth;
          canvas.height = (desiredWidth / viewport.width) * viewport.height;
          const renderContext = {
            canvasContext: context,
            viewport: page.getViewport({ scale: desiredWidth / viewport.width }),
          };
          await page.render(renderContext).promise;
          const imageURL = canvas.toDataURL('image/jpeg', 0.8);
          yield { imageURL };
        } catch (error) {
          displayError(`Error rendering page ${i}:`, error);
        }
      }
    }
    return {numPages: numPages, imageIterator: images()};
  }

async function ocrImage(worker, imageUrl) {
    const {
      data: { text },
    } = await worker.recognize(imageUrl);
    return { text };
}


function processDocx(file) {
    var reader = new FileReader();

    document.getElementById('processingMessage').style.display = 'block';
    
    reader.onload = function(event) {
        var arrayBuffer = event.target.result;
        
        mammoth.extractRawText({arrayBuffer: arrayBuffer})
            .then(function(result) {
                fileCharacterCount = result.value.length;
                document.getElementById('textOutput').value = result.value.trim();
                document.getElementById('character-count').value = fileCharacterCount;
                checkFileSize(file, fileCharacterCount);
            })
            .catch(function(err) {
                displayError('Error: ' + err.message)
            });
    };

    reader.readAsArrayBuffer(file);
}

function processPptxFile(file) {
    var reader = new FileReader();

    document.getElementById('processingMessage').style.display = 'block';

    reader.onload = function(e) {
        var content = e.target.result;
        var zip = new JSZip();

        zip.loadAsync(content).then(function(zip) {
            var slideTextPromises = Object.keys(zip.files)
                .filter(function(fileName) {
                    return /^ppt\/slides\/slide\d+\.xml$/.test(fileName);
                })
                .map(function(fileName) {
                    return zip.files[fileName].async("string").then(function(text) {
                        var parser = new DOMParser();
                        var xmlDoc = parser.parseFromString(text, "application/xml");
                        var textElements = xmlDoc.getElementsByTagName('a:t');
                        var slideText = Array.from(textElements).map(function(elem) {
                            return elem.textContent;
                        }).join(" ");
                        return slideText;
                    });
                });

            Promise.all(slideTextPromises).then(function(slidesText) {
                slidesText = slidesText.join("\n\n");
                document.getElementById('textOutput').value = slidesText.trim();
                fileCharacterCount = slidesText.length;
                document.getElementById('character-count').value = fileCharacterCount;
                checkFileSize(file, fileCharacterCount);
            });
        }).catch(function(err) {
            displayError('Failed to read PPTX file: ' + err.message);
        });
    };

    reader.readAsArrayBuffer(file); 
}

function processXlsxFile(file) {
    var reader = new FileReader();

    document.getElementById('processingMessage').style.display = 'block';

    reader.onload = function(e) {
        var data = new Uint8Array(e.target.result);
        var workbook = XLSX.read(data, {type: 'array'});
        var outputText = '';
        workbook.SheetNames.forEach(function(sheetName) {
            var worksheet = workbook.Sheets[sheetName];
            var text = XLSX.utils.sheet_to_csv(worksheet, {header: 1}); 

            outputText += "Sheet: " + sheetName + "\n" + text + "\n\n";
        });
        
        document.getElementById('textOutput').value = outputText.trim();
        fileCharacterCount = outputText.length;
        document.getElementById('character-count').value = fileCharacterCount;
        checkFileSize(file, fileCharacterCount);
    };

    reader.onerror = function() {
        displayError('Failed to read the XLSX file.');
    };

    reader.readAsArrayBuffer(file); 
}

function processTextFile(file) {
    var reader = new FileReader();

    document.getElementById('processingMessage').style.display = 'block';

    reader.onload = function(event) {
        document.getElementById('textOutput').value = event.target.result.trim();
        fileCharacterCount = event.target.result.length;
        document.getElementById('character-count').value = fileCharacterCount;
        checkFileSize(file, fileCharacterCount);
    };

    reader.onerror = function() {
        displayError('Failed to read the file.');
    };

    reader.readAsText(file);
}

function checkFileSize(file, fileCharacterCount) {
    result = checkCharacterCount(fileCharacterCount);
    if (result == 'OK') {
        displaySuccess(file);
    }
    else {
        displayError(result);
    }
}

function checkCharacterCount(fileCharacterCount) {
    var projectType = document.getElementById('project-type');
    if (projectType.value == 'long') {
        if (fileCharacterCount > 280000 ) {
           return 'The text in your file exceeded 280,000 characters, which is too long.';
        }
        else if (fileCharacterCount < 18000 ) {
            return 'The text in your file is under 18,000 characters, which is too short.';
        }
        else {
            return 'OK';
        }
    }
    else {
        if (fileCharacterCount > 15000 ) {
            return 'The text in your file exceeded 15,000 characters, which is too long.';
        }
        else {
            return 'OK';
        }
    }
}

function displaySuccess(file) {
    document.getElementById('failure').style.display = 'none';
    document.getElementById('warning').style.display = 'none';
    document.getElementById('processingMessage').style.display = 'none';

    calculateCode(file).then(hash => {
        document.getElementById('codeOutput').value = hash;
        document.getElementById('success').style.display = 'block';
    });
}

function displayError(errorMessage) {
    document.getElementById('failure').textContent = errorMessage;
    document.getElementById('failure').style.display = 'block';
    document.getElementById('success').style.display = 'none';
    document.getElementById('warning').style.display = 'none';
    document.getElementById('processingMessage').style.display = 'none';
}

function copyCode() {
    const copyText = document.getElementById("codeOutput");
    navigator.clipboard.writeText(copyText.value)
        .then(() => {
            const button = document.getElementById("copyButton");
            button.textContent = "Copied!";
            setTimeout(() => { button.textContent = "Copy"; }, 5000); // Reset button text after 2 seconds
        })
        .catch(err => {
            const button = document.getElementById("copyButton");
            button.textContent = "Failed to copy";
            setTimeout(() => { button.textContent = "Copy"; }, 5000); // Reset button text after 2 seconds
        });
}