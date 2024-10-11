import { GenerativeModel, GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotFoundError } from "./errors";

[
  "Politics & Governance",
  "Race & Identity",
  "Free Speech & Censorship",
  "Social Justice & Activism",
  "Religion & Belief Systems",
  "Health & Lifestyle",
  "Economic Inequality & Class Issues",
  "Language & Communication",
  "Gender & Sexuality",
];

enum CategoryEnum {
  Category1 = "Politics & Governance",
  Category2 = "Race & Identity",
  Category3 = "Free Speech & Censorship",
  Category4 = "Social Justice & Activism",
  Category5 = "Religion & Belief Systems",
  Category6 = "Health & Lifestyle",
  Category7 = "Economic Inequality & Class Issues",
  Category8 = "Language & Communication",
  Category9 = "Gender & Sexuality",
}
// the is proof of concept
type CategoryType = keyof typeof CategoryEnum;
export interface CategoryDoc extends BaseDoc {
  category: CategoryType;
  labels: ObjectId[];
}

export interface LabelDoc extends BaseDoc {
  label: string;
  items: ObjectId[];
}

// Need to rework again: realized something may not work at all!
/**WIP!!! */
// TODO: add deleting functionality
/**
 * concept: Labeling [Item, Categories]
 */
export default class LabelingConcept<T, U> {
  public readonly categories: DocCollection<CategoryDoc>;
  public readonly labels: DocCollection<LabelDoc>;
  public readonly allowedCategories: U;

  /**
   * Make an instance of Labeling.
   */
  constructor(collectionName: string, allowedCategories: U) {
    this.labels = new DocCollection<LabelDoc>(collectionName + "Labels");
    this.categories = new DocCollection<CategoryDoc>(collectionName + "Categories");
    this.allowedCategories = allowedCategories;
  }

  /**
   * Update the labels with items they label
   * @param item item in the app
   * @param labels labels for the item
   * @returns successful message
   */
  async addLabelsForItem(item: ObjectId, labels: string[]) {
    // find category
    const category = await this.findCategoryGemini(labels);
    // add all items with corresponding labels
    const labelIds = await this.addLabels(labels, item);
    // add labels to category
    await this.addLabelsForCategory(category, labelIds);
    return { msg: `Labels ${labels} successfully added!` };
  }

  /**
   * remove labels from items and respective categories if there are no other items
   * @param item labeled item
   */
  async removeItemFromLabel(item: ObjectId) {
    await this.labels.updateMany({}, { $pull: { items: item } });
    const labelDocs = await this.labels.readMany({ labels: { $size: 0 } });
    for (const label of labelDocs) {
      await this.categories.updateMany({}, { $pull: { labels: label.label } });
      await this.categories.deleteMany({ labels: { $size: 0 } });
    }
    await this.labels.deleteMany({ items: { $size: 0 } });
  }

  /**
   * Get all items with given tag
   * @param tag a label
   * @returns all item ids with that label
   * @throws error if there are no items with a given tag
   */
  async getItemsWithLabel(label: string): Promise<ObjectId[]> {
    const labelDocs = await this.labels.readMany({ label });
    if (labelDocs.length === 0) {
      throw new NotFoundError(`No items have label ${label}!`);
    }
    const items = labelDocs.reduce((accumulator, curLabelDoc) => {
      return accumulator.concat(curLabelDoc.items);
    }, labelDocs[0].items);
    return items;
  }

  /**
   * Get all labels within a field
   * @param category any
   * @returns all item ids within the category
   * @throws error if there are no labels in a given category
   */
  async getLabelsInCategory(category: string): Promise<ObjectId[]> {
    const categoryDocs = await this.categories.readMany({ category: category as CategoryType });
    if (categoryDocs.length === 0) {
      throw new NotFoundError(`No items are in category ${category}!`);
    }
    const labels = categoryDocs.reduce((accumulator, curCategoryDoc) => {
      return accumulator.concat(curCategoryDoc.labels);
    }, categoryDocs[0].labels);
    return labels;
  }

  /**
   * Get pairings of content in the given category with opposing content
   * @param category general category
   * @returns pairings of content in the category
   */
  async getOpposingItems(category: string): Promise<ObjectId[][]> {
    // TODO: get opposing items on the category
    const oppositeItems: ObjectId[][] = [];
    const closestCategory = await this.getClosestExistingCategory(category);
    const labels = await this.getLabelsInCategory(closestCategory);
    const oppositeLabels = await this.getOppositeLabelPairs(labels, category);
    for (const [l1, l2] of oppositeLabels) {
      const items_l1 = await this.getItemsWithLabel(l1);
      const items_l2 = await this.getItemsWithLabel(l2);
      // TODO: somehow get unique
      for (let i = 0; i < Math.min(items_l1.length, items_l2.length); i++) {
        oppositeItems.push([items_l1[i], items_l2[i]]);
      }
    }
    return oppositeItems;
  }

  /**
   * Get all possible categories
   * @returns get all categories we have content in so far
   */
  async getAllCategories(): Promise<string[]> {
    return (await this.categories.readMany({})).map((categoryDoc) => categoryDoc.category);
  }

  /**
   * Tag item with labels
   * @param labels tags for an item
   * @param item any
   * @returns returns ids of the labels stored
   */
  private async addLabels(labels: string[], item: ObjectId): Promise<ObjectId[]> {
    const labelIds: ObjectId[] = [];
    for (const label of labels) {
      let labelDoc = await this.labels.readOne({ label });
      if (labelDoc === null) {
        labelIds.concat(await this.labels.createOne({ label, items: [item] }));
      } else {
        labelIds.push(labelDoc._id);
        await this.labels.partialUpdateOne({ label }, { items: labelDoc.items.concat([item]) });
      }
    }
    return labelIds;
  }

  /**
   * Add tags to category
   * @param category any
   * @param labelIds ids for the tags
   */
  private async addLabelsForCategory(category: string, labelIds: ObjectId[]) {
    let categoryDoc = await this.categories.readOne({ category });
    if (categoryDoc === null) {
      await this.categories.createOne({ category, labels: labelIds });
    } else {
      const allLabelIds = categoryDoc.labels.concat(labelIds);
      const uniqueLabels = this.findUniqueIds(allLabelIds);
      await this.categories.partialUpdateOne({ category }, { labels: uniqueLabels });
    }
  }

  // for now ask GEMINI
  private getModelForCategory(): GenerativeModel {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

    const schema = {
      description: "List of opposing label pairs in a given category",
      type: SchemaType.STRING,
    };

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
      systemInstruction: `Given a set of labels, decide which one of these categories the labels fit the best. 
      The categories: [${Object.values(CategoryEnum)}]`,
    });

    return model;
  }

  /**
   * Get general category labels belong to
   * @param labels tags
   * @returns One of the general categories the labels belong to
   */
  private async findCategoryGemini(labels: string[]): Promise<CategoryType> {
    const model = this.getModelForCategory();
    const result = await model.generateContent(`
      Here are the labels: \`\`\`${labels}\`\`\``);
    return JSON.parse(result.response.text());
  }

  /**
   * Get unique array of mongodb objectIds
   * @param ids some mongodb objectids
   * @returns unique objectIds
   */
  private findUniqueIds(ids: ObjectId[]): ObjectId[] {
    return [...new Set(ids.map((id) => id.toString()))].map((idstring) => new ObjectId(idstring));
  }

  private async getLabelsValues(labels: ObjectId[]): Promise<string[]> {
    return (await this.labels.readMany(labels)).map((labelDoc) => labelDoc.label);
  }

  private getModelForLabelPairs(): GenerativeModel {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

    const schema = {
      description: "List of opposing label pairs in a given category",
      type: SchemaType.ARRAY,
      items: {
        description: "A pair of strings that are opposites of each other in a given category",
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.STRING,
          nullable: false,
        },
      },
    };

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    return model;
  }

  private async getOppositeLabelPairs(labels: ObjectId[], category: string): Promise<string[][]> {
    const labelVaues = await this.getLabelsValues(labels);
    const model = this.getModelForLabelPairs();
    const result = await model.generateContent(`
      Given a list of labels enclosed in \`\`\` in category ${category}, 
      pair the labels l_1 and l_2 together 
      iff l_1 and l_2 have opposing meaning in category ${category}. 
       Decide on the pairing and return an array of tuples of labels. Here are the labels \`\`\`${labelVaues}\`\`\``);
    return JSON.parse(result.response.text());
  }

  private async getClosestExistingCategory(category: string): Promise<string> {
    // TODO would be useful in future
    return category;
  }

  // could be good in future, but did not figure out thesaurus api
  /**
   * Find general field the labels belong to
   * @param labels some words that can be part of a common category
   * @returns category that these labels belong to
   */
  // private async findCategory(labels: string[]): Promise<string> {
  //   // TODO: some NLP
  //   const categories: Map<string, number> = new Map();
  //   for (const label of labels) {
  //     try {
  //       const res = await thesaurus(label);
  //       for (const topic of res.topics) {
  //         const freq = categories.get(topic);
  //         if (freq !== undefined) {
  //           categories.set(topic, freq + 1);
  //         } else {
  //           categories.set(topic, 1);
  //         }
  //       }
  //     } catch (err) {
  //       console.error(err);
  //     }
  //   }

  //   let mostFreqCategory: string = Object.keys(categories)[0];
  //   let maxValue = -Infinity;

  //   for (const [key, value] of Object.entries(categories)) {
  //     if (value > maxValue) {
  //       maxValue = value;
  //       mostFreqCategory = key;
  //     }
  //   }
  //   return mostFreqCategory;
  // }
}
