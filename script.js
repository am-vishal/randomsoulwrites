function generate() {
  let text = document.getElementById("inputText").value;

  let formatted = text
    .split("\n")
    .map((line) => {
      line = line.trim();
      if (!line) return "";
      return line.charAt(0).toUpperCase() + line.slice(1);
    })
    .join("\n\n");

  document.getElementById("outputText").innerText = formatted;
}

// DOWNLOAD IMAGE
function downloadImage() {
  const card = document.getElementById("card");

  html2canvas(card, {
    scale: 2,
    useCORS: true,
  }).then((canvas) => {
    const link = document.createElement("a");
    link.download = "randomsoulwrites.png";
    link.href = canvas.toDataURL();
    link.click();
  });
}
