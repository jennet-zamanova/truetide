import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { ObjectId } from "mongodb";
import OpenAI from "openai";
import DocCollection, { BaseDoc } from "../framework/doc";

import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { NotFoundError } from "./errors";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

  /**
   * Find citations for the `text`
   * @param text information
   * @returns citations to support information
   */
  async createCitationsGPT(text: string) {
    const rolePrompt = `Find credible online sources.`;

    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: rolePrompt },
        { role: "user", content: this.createPrompt(text) },
      ],
      response_format: zodResponseFormat(Citations, "links"),
    });

    const links = completion.choices[0].message.parsed;
    return links;
  }

  async createCitationsGemini(text: string) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
    const schema = {
      type: SchemaType.ARRAY,
      items: {
        description: "URL for the source supporting the content",
        type: SchemaType.STRING,
      },
    };
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 64,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });
    const result = await model.generateContent(this.createPrompt(text));
    return JSON.parse(result.response.text());
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

  /**
   * Remove all citations for an `item`
   * @param item content id
   * @returns successful message
   * @throws error if the `item` does not exist
   */
  async deleteAllCitationsForContent(item: ObjectId) {
    const _id = await this.citations.readOne({ item });
    if (!_id) {
      throw new NotFoundError(`Item ${item} does not exist!`);
    }
    this.citations.deleteOne({ _id });
    return { msg: "Citations deleted successfully!" };
  }
}
