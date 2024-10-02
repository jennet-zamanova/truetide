import { ObjectId } from "mongodb";
import OpenAI from "openai";
import DocCollection, { BaseDoc } from "../framework/doc";
const openai = new OpenAI();

import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

const Citations = z.object({
  links: z.array(z.string()),
});

export interface CitationDoc extends BaseDoc {
  urls: URL[];
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
   * Find citations for the `text`
   * @param text information
   * @returns citations to support information
   */
  async createCitations(text: String) {
    const rolePrompt = `Find credible online sources.`;
    const prompt =
      `Given some text, find credible online sources that support
    this information. To make things more convenient, provide direct links to 
    specific articles or pages within the sources you found. Here is the text: """` +
      text +
      `"""`;
    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: rolePrompt },
        { role: "user", content: prompt },
      ],
      response_format: zodResponseFormat(Citations, "links"),
    });

    const links = completion.choices[0].message.parsed;
    return links;
  }

  /**
   * Stored the citations for the given content
   * @param content supported by citations
   * @param citations links to sources
   * @returns confirmation message
   */
  async addCitations(content: ObjectId, citations: URL[]) {
    let citationdoc = await this.citations.readOne({ _id: content });
    if (citationdoc === null) {
      await this.citations.createOne({ urls: citations, item: content });
    } else {
      await this.citations.partialUpdateOne({ items: content }, { urls: citationdoc.urls.concat(citations) });
    }
    return { msg: "Citations successfully added!", citations: await this.citations.readOne({ _id: content }) };
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
}
