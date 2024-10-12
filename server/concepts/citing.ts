import { ObjectId } from "mongodb";
// import OpenAI from "openai";
import DocCollection, { BaseDoc } from "../framework/doc";

import { z } from "zod";
import { NotFoundError } from "./errors";
import { getModelForCitations } from "./utils";

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

const Citations = z.object({
  links: z.array(z.string()),
});

// While this code may look very specific, note that
// none of these parts assume anything about item they are citing
// so can be used on comments, textual posts, video posts, etc.

export interface CitationDoc extends BaseDoc {
  urls: string[];
  item: ObjectId;
}

/**
 * concept: Citing [Item]
 */
export default class CitingConcept {
  public readonly citations: DocCollection<CitationDoc>;

  /**
   * Make an instance of Citing.
   */
  constructor(collectionName: string) {
    this.citations = new DocCollection<CitationDoc>(collectionName);
  }

  /**
   * @param text information
   * @returns prompt for LLM to get credible sources
   */
  private createPrompt(text: string) {
    const prompt =
      `Given some text, find credible online sources that support
  this information. To make things more convenient, provide direct links to 
  specific articles or pages within the sources you found. Here is the text: """` +
      text +
      `"""`;
    return prompt;
  }

  // NOTE!!!!
  // GEMINI is worse than OPENAI, so links will not be as good, but no one is investing in me yet, sorry :(
  /**
   * Find citations for the `text`
   * @param text information
   * @returns citations to support information
   */
  // private async createCitationsGPT(text: string) {
  //   const rolePrompt = `Find credible online sources.`;

  //   const completion = await openai.beta.chat.completions.parse({
  //     model: "gpt-4o-mini",
  //     messages: [
  //       { role: "system", content: rolePrompt },
  //       { role: "user", content: this.createPrompt(text) },
  //     ],
  //     response_format: zodResponseFormat(Citations, "links"),
  //   });

  //   const links = completion.choices[0].message.parsed?.links;
  //   return links;
  // }

  async createCitationsGemini(text: string) {
    // TODO: need to learn how to deal with token limits and display messaged accordingly
    const model = getModelForCitations();
    const result = await model.generateContent(this.createPrompt(text));
    return JSON.parse(result.response.text());
  }

  /**
   * Stored the citations for the given content
   * @param content supported by citations
   * @param citations links to sources
   * @returns confirmation message
   */
  async addCitations(content: ObjectId, citations: string[]) {
    let citationdoc = await this.citations.readOne({ item: content });
    if (citationdoc === null) {
      await this.citations.createOne({ urls: citations, item: content });
    } else {
      await this.citations.partialUpdateOne({ item: content }, { urls: [...new Set(citationdoc.urls.concat(citations))] });
    }
    return { msg: "Citations successfully added!", citations: await this.citations.readOne({ item: content }) };
  }

  /**
   * Get citations for the given content
   * @param content any
   * @returns array of citations for the content
   */
  async getCitations(content: ObjectId) {
    const links = await this.citations.readOne({ item: content });
    if (links === null) {
      return { msg: "No citations for this content", citations: [] };
    }
    return { msg: "Citations successfully fetched!", citations: links.urls };
  }

  /**
   * Remove all citations for an `item`
   * @param item content id
   * @returns successful message
   * @throws error if the `item` does not exist
   */
  async deleteAllCitationsForContent(item: ObjectId) {
    const _id = (await this.citations.readOne({ item }))?._id;
    if (!_id) {
      throw new NotFoundError(`Item ${item} does not exist!`);
    }
    await this.citations.deleteOne({ _id });
    return { msg: "Citations deleted successfully!" };
  }

  async update(item: ObjectId, citations: string[]) {
    let citationdoc = await this.citations.readOne({ item });
    if (citationdoc === null) {
      await this.citations.createOne({ urls: citations, item });
    } else {
      await this.citations.partialUpdateOne({ item }, { urls: citations });
    }
    return { msg: "Citations successfully added!", citations: await this.citations.readOne({ item }) };
  }
}
