const text = "Aqui estao algumas fotos:\n\n![Suíte 1](https://example.com/1.jpg)\n![Geral](https://example.com/2.jpg)";
const mdImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
let match;
while ((match = mdImgRegex.exec(text)) !== null) {
  console.log("Match:", match[1], match[2]);
}
