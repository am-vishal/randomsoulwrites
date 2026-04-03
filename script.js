function generateDesign() {
  let text = document.getElementById("inputText").value;

  // Capitalize first letter of each paragraph
  let formatted = text
    .split("\n")
    .map((line) => line.charAt(0).toUpperCase() + line.slice(1))
    .join("\n\n");

  document.getElementById("outputText").innerText = formatted;
}
