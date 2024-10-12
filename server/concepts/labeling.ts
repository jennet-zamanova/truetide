import assert from "assert";
import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotFoundError } from "./errors";
import { getModelForCategory, getModelForLabelPairs } from "./utils";
// the is proof of concept
// type CategoryType = keyof typeof U;
export interface CategoryDoc extends BaseDoc {
  category: string;
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
export default class LabelingConcept {
  public readonly categories: DocCollection<CategoryDoc>;
  public readonly labels: DocCollection<LabelDoc>;
  private readonly allowedCategories: string[];

  /**
   * Make an instance of Labeling.
   */
  constructor(collectionName: string, allowedCategories: string[]) {
    this.labels = new DocCollection<LabelDoc>(collectionName + "Labels");
    this.categories = new DocCollection<CategoryDoc>(collectionName + "Categories");
    this.allowedCategories = allowedCategories.concat(["all"]);
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
    console.log("returned closest category:", category);

    const labelIds = await this.addItemToLabels(labels, item);
    console.log("returned ids: ", labelIds);
    // add labels to category
    await this.addLabelsForCategory(category, labelIds);
    return { msg: `Labels ${labels} successfully added!` };
  }

  async getLabelsForItem(item: ObjectId): Promise<string[]> {
    return (await this.labels.readMany({ items: item })).map((labelDoc) => labelDoc.label);
  }

  async updateLabelsForItem(item: ObjectId, labels: string[]) {
    console.log("updating labels: ", labels);
    const current_labels = await this.getLabelsForItem(item);
    console.log("current labels: ", current_labels);
    const add_labels = labels.filter((label) => !current_labels.includes(label));
    const remove_labels = current_labels.filter((label) => !labels.includes(label));
    console.log(`add labals ${add_labels} remove labels ${remove_labels}`);
    await this.addLabelsForItem(item, add_labels);
    await this.removeItemFromLabel(item, { label: { $in: remove_labels } });
    return { msg: "Labels successfully updated!" };
  }

  /**
   * remove labels from items and respective categories if there are no other items
   * @param item labeled item
   */
  async removeItemFromLabel(item: ObjectId, labels: { label: { $in: string[] } } | {} = {}) {
    await this.labels.updateMany(labels, { $pull: { items: item } });
    const labelDocs = await this.labels.readMany({ labels: { $size: 0 } });
    for (const label of labelDocs) {
      await this.categories.updateMany({}, { $pull: { labels: label._id } });
      await this.categories.deleteMany({ labels: { $size: 0 } });
    }
    await this.labels.deleteMany({ items: { $size: 0 } });
  }

  /**
   * Get pairings of content in the given category with opposing content
   * @param category general category
   * @returns pairings of content in the category
   */
  async getOpposingItems(category: string): Promise<ObjectId[][]> {
    const oppositeItems: ObjectId[][] = [];
    const closestCategory = await this.getClosestExistingCategory(category);
    assert(this.allowedCategories.includes(closestCategory), `expected one of ${this.allowedCategories} but got category ${category}`);
    const labels = await this.getLabelsInCategory(closestCategory);
    console.log("the labels are: ", labels);
    const oppositeLabels = await this.getOppositeLabelPairs(labels, category);
    console.log("the opposite label pairs are: ", labels);
    for (const [l1, l2] of oppositeLabels) {
      const items_l1 = await this.getItemsWithLabel(l1);
      const items_l2 = await this.getItemsWithLabel(l2);
      // TODO: somehow get unique
      for (let i = 0; i < Math.min(items_l1.length, items_l2.length); i++) {
        oppositeItems.push([items_l1[i], items_l2[i]]);
        console.log("the opposite items: ", oppositeItems);
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
   * Get all items with given tag
   * @param tag a label
   * @returns all item ids with that label
   * @throws error if there are no items with a given tag
   */

  async getItemsWithLabel(label: string): Promise<ObjectId[]> {
    const labelDocs = await this.labels.readMany({ label });
    if (labelDocs.length === 0) {
      throw new NotFoundError(`No items have label ${label}!`);
    } else if (labelDocs.length === 1) {
      return labelDocs[0].items;
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
   * @throws error if there are no labels in a given category, or category is not allowed
   */
  private async getLabelsInCategory(category: string): Promise<ObjectId[]> {
    assert(this.allowedCategories.includes(category), `expected one of ${this.allowedCategories} but got category ${category}`);
    const categoryDocs = await this.categories.readMany({ category: category });
    if (categoryDocs.length === 0) {
      throw new NotFoundError(`No items are in category ${category}!`);
    }
    const labels = categoryDocs.reduce((accumulator, curCategoryDoc) => {
      return accumulator.concat(curCategoryDoc.labels);
    }, categoryDocs[0].labels);
    return labels;
  }

  /**
   * Tag item with labels
   * @param labels tags for an item
   * @param item any
   * @returns returns ids of the labels stored
   */
  private async addItemToLabels(labels: string[], item: ObjectId): Promise<ObjectId[]> {
    const labelIds: ObjectId[] = [];
    for (const label of labels) {
      let labelDoc = await this.labels.readOne({ label });
      if (labelDoc === null) {
        labelIds.push(await this.labels.createOne({ label, items: [item] }));
      } else {
        labelIds.push(labelDoc._id);
        // await this.labels.partialUpdateOne({ label }, { items: labelDoc.items.concat([item]) });
        await this.labels.updateMany({ label }, { $addToSet: { items: item } });
      }
      console.log("the doc: ", labelDoc);
      console.log("updated label ids ", labelIds);
    }
    return labelIds;
  }

  /**
   * Add tags to category
   * @param category any
   * @param labelIds ids for the tags
   */
  private async addLabelsForCategory(category: string, labelIds: ObjectId[]) {
    console.log("here are the label ids", labelIds);
    assert(this.allowedCategories.includes(category), `expected one of ${this.allowedCategories} but got ${category}`);
    let categoryDoc = await this.categories.readOne({ category });
    if (categoryDoc === null) {
      await this.categories.createOne({ category, labels: labelIds });
    } else {
      const allLabelIds = categoryDoc.labels.concat(labelIds);
      const uniqueLabels = this.findUniqueIds(allLabelIds);
      // await this.categories.partialUpdateOne({ category }, { labels: uniqueLabels });
      await this.categories.updateMany({ category }, { $addToSet: { labels: { $each: uniqueLabels } } });
    }
  }

  /**
   * Get general category labels belong to
   * @param labels tags
   * @returns One of the general categories the labels belong to
   */
  private async findCategoryGemini(labels: string[]): Promise<string> {
    const model = getModelForCategory(this.allowedCategories);
    const result = await model.generateContent(`
      Here are the labels: \`\`\`${labels}\`\`\``);
    const category = JSON.parse(result.response.text());
    if (category in this.allowedCategories) {
      return category;
    } else {
      return "all";
    }
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
    return (await this.labels.readMany({ _id: { $in: labels } })).map((labelDoc) => labelDoc.label);
  }

  private async getOppositeLabelPairs(labels: ObjectId[], category: string): Promise<string[][]> {
    const labelVaues = await this.getLabelsValues(labels);
    console.log("label values", labelVaues);
    const model = getModelForLabelPairs();
    const result = await model.generateContent(`
      Given a list of labels enclosed in \`\`\` in category ${category}, 
      pair the labels l_1 and l_2 together 
      iff l_1 and l_2 have opposing meaning in category ${category}. 
       Decide on the pairing and return an array of tuples of labels. Here are the labels \`\`\`${labelVaues}\`\`\``);
    return JSON.parse(result.response.text());
  }

  // Future work
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
