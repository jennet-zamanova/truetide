// // Function to fetch related words from a Thesaurus API
// async function fetchRelatedWords(word: string): Promise<string[]> {
//   // Replace this URL with the actual API endpoint and API key
//   const response = await fetch(`https://api.datamuse.com/words?ml=${word}`);
//   const data = await response.json();
//   return data.map((entry: any) => entry.word);
// }

// // Function to find the most common related category
// async function inferCategory(labels: string[]): Promise<string> {
//   const relatedWordsMap: { [key: string]: number } = {};

//   for (const label of labels) {
//     const relatedWords = await fetchRelatedWords(label);

//     relatedWords.forEach((word) => {
//       if (relatedWordsMap[word]) {
//         relatedWordsMap[word]++;
//       } else {
//         relatedWordsMap[word] = 1;
//       }
//     });
//   }

//   // Find the most frequent related word
//   let inferredCategory = "";
//   let maxFrequency = 0;
//   for (const [word, frequency] of Object.entries(relatedWordsMap)) {
//     if (frequency > maxFrequency) {
//       maxFrequency = frequency;
//       inferredCategory = word;
//     }
//   }

//   return inferredCategory;
// }

// // Example usage
// const labels = ["democrats", "republicans", "elections"];
// inferCategory(labels).then((category) => {
//   console.log(`Inferred category: ${category}`);
// });

var thesaurus = require("powerthesaurus-api");

// Callbacks:
thesaurus("car", function (err: Error, res: {}) {
  if (err) throw err;
  console.log(res);
});
