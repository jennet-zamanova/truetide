import { ObjectId } from "mongodb";

import { Router, getExpressRouter } from "./framework/router";

import { Authing, Citing, Labeling, Posting, Sessioning } from "./app";
import { PostOptions } from "./concepts/posting";
import { SessionDoc } from "./concepts/sessioning";
import Responses from "./responses";

import { z } from "zod";
import { NotAllowedError } from "./concepts/errors";

/**
 * Web server routes for the app. Implements synchronizations between concepts.
 */
class Routes {
  // Synchronize the concepts from `app.ts`.

  @Router.get("/session")
  async getSessionUser(session: SessionDoc) {
    const user = Sessioning.getUser(session);
    return await Authing.getUserById(user);
  }

  @Router.get("/users")
  async getUsers() {
    return await Authing.getUsers();
  }

  @Router.get("/users/:username")
  @Router.validate(z.object({ username: z.string().min(1) }))
  async getUser(username: string) {
    return await Authing.getUserByUsername(username);
  }

  @Router.post("/users")
  async createUser(session: SessionDoc, username: string, password: string) {
    Sessioning.isLoggedOut(session);
    return await Authing.create(username, password);
  }

  @Router.patch("/users/username")
  async updateUsername(session: SessionDoc, username: string) {
    const user = Sessioning.getUser(session);
    return await Authing.updateUsername(user, username);
  }

  @Router.patch("/users/password")
  async updatePassword(session: SessionDoc, currentPassword: string, newPassword: string) {
    const user = Sessioning.getUser(session);
    return Authing.updatePassword(user, currentPassword, newPassword);
  }

  @Router.delete("/users")
  async deleteUser(session: SessionDoc) {
    const user = Sessioning.getUser(session);
    Sessioning.end(session);
    return await Authing.delete(user);
  }

  @Router.post("/login")
  async logIn(session: SessionDoc, username: string, password: string) {
    const u = await Authing.authenticate(username, password);
    Sessioning.start(session, u._id);
    return { msg: "Logged in!" };
  }

  @Router.post("/logout")
  async logOut(session: SessionDoc) {
    Sessioning.end(session);
    return { msg: "Logged out!" };
  }

  /**
   * Posting routes
   */
  @Router.get("/posts")
  @Router.validate(z.object({ author: z.string().optional() }))
  async getPosts(author?: string) {
    let posts;
    if (author) {
      const id = (await Authing.getUserByUsername(author))._id;
      posts = await Posting.getByAuthor(id);
    } else {
      posts = await Posting.getPosts();
    }
    return Responses.posts(posts);
  }

  /**
   * Update all MONGODB collections to add item and associated values
   * @param session
   * @param content url to a video file
   * @param citations comma separated values
   * @param labels comma separated values
   * @param options
   * @returns
   */
  @Router.post("/posts")
  async createPost(session: SessionDoc, content: string, citations: string, labels: string, options?: PostOptions) {
    const links = citations.split(", ");
    if (links.map((link) => URL.canParse(link)).filter((isLink) => !isLink).length !== 0) {
      throw new NotAllowedError(`expected comma-separated links but got ${citations}`);
    }
    if (!URL.canParse(content)) {
      throw new NotAllowedError("Expected a link to a video but got ", content);
    }
    const user = Sessioning.getUser(session);
    const created = await Posting.create(user, content, options);
    const _id = created.post?._id;
    if (_id !== undefined) {
      await Citing.addCitations(_id, links);
      await Labeling.addLabelsForItem(_id, labels.split(", "));
    }
    return { msg: created.msg, post: await Responses.post(created.post) };
  }

  /**
   * Update all MONGODB collections to update item and associated values
   * @param session
   * @param content url to a video file
   * @param citations comma separated values
   * @param labels comma separated values
   * @param options
   * @returns
   */
  @Router.patch("/posts/:id")
  async updatePost(session: SessionDoc, id: string, content?: string, citations?: string, labels?: string, options?: PostOptions) {
    const links = citations?.split(", ") ?? [];
    if (links.map((link) => URL.canParse(link)).filter((isLink) => !isLink).length !== 0) {
      throw new NotAllowedError(`expected comma-separated links but got ${citations}`);
    }
    if (content) {
      if (!URL.canParse(content)) {
        throw new NotAllowedError("Expected a link to a video but got ", content);
      }
    }
    const user = Sessioning.getUser(session);
    const oid = new ObjectId(id);
    await Posting.assertAuthorIsUser(oid, user);
    if (citations) {
      await Citing.update(oid, links);
    }
    if (labels) {
      await Labeling.updateLabelsForItem(oid, labels.split(", "));
    }
    return await Posting.update(oid, content, options);
  }

  @Router.delete("/posts/:id")
  async deletePost(session: SessionDoc, id: string) {
    const user = Sessioning.getUser(session);
    const oid = new ObjectId(id);
    await Posting.assertAuthorIsUser(oid, user);
    await Citing.deleteAllCitationsForContent(oid);
    await Labeling.removeItemFromLabel(oid);
    return Posting.delete(oid);
  }

  /**
   * Citing routes
   */

  @Router.get("/posts/:postId/citations")
  async getCitations(postId: string) {
    const oid = new ObjectId(postId);
    const citations = (await Citing.getCitations(oid)).citations;
    return citations;
  }

  @Router.post("/posts/:postId/citations")
  async addCitations(session: SessionDoc, postId: string, links: string) {
    const urls = links.split(", ");
    if (urls.map((link) => URL.canParse(link)).filter((isLink) => !isLink).length !== 0) {
      throw new NotAllowedError(`expected comma-separated links but got ${links}`);
    }
    const user = Sessioning.getUser(session);
    const oid = new ObjectId(postId);
    await Posting.assertAuthorIsUser(oid, user);
    console.log("here are the urls to be added", urls);
    return await Citing.addCitations(oid, urls);
  }

  @Router.get("/citations/suggestions")
  async getSuggestedCitationsContent(fileURL: string) {
    if (!URL.canParse(fileURL)) {
      throw new NotAllowedError("Expected a link to a video but got ", fileURL);
    }
    const text = await Posting.getFileText(fileURL);
    console.log(`Here is the text of the video ${text}`);
    return await Citing.createCitationsGemini(text);
  }

  @Router.get("/citations/localsuggestions")
  async getSuggestedCitationsContentLocally(filePath: string) {
    const text = await Posting.getFileTextLocally(filePath);
    console.log(`Here is the text of the video ${text}`);
    return await Citing.createCitationsGemini(text);
  }

  /**
   * Labeling routes
   */

  // get the "feed"
  @Router.get("/categories")
  async getAllCategories() {
    return await Labeling.getAllCategories();
  }

  @Router.get("/posts/labels/:label")
  async getItems(label: string) {
    return await Labeling.getItemsWithLabel(label);
  }

  // get opposing posts on a topic
  @Router.get("/posts/:category")
  async getPairedPostsOnTopic(category: string) {
    if (!(await Labeling.getAllCategories()).includes(category)) {
      return { msg: `the are no posts in category ${category} yet` };
    }
    const allPosts = [];
    const postPairs = await Labeling.getOpposingItems(category);
    console.log("here are the pairs", postPairs);
    for (const postPair of postPairs) {
      const contents = await Posting.getPostsSubset(postPair);
      console.log("here are the contents: ", contents);
      const labels = await Promise.all(postPair.map((post) => Labeling.getLabelsForItem(post)));
      console.log("here are the labels: ", labels);
      const post_info = contents.map((content, index) => {
        return { content: content, labels: labels[index] };
      });
      allPosts.push(post_info);
      console.log("here are the posts: ", allPosts);
    }
    return allPosts;
  }

  // @Router.get("/posts/download/:videoid")
  // async downloadVideo(videoid: string) {
  //   console.log("the video id we are using: ", videoid, new ObjectId(videoid));
  //   await Posting.posts.downloadVideo(new ObjectId(videoid), "test.mp4");
  //   return { msg: "Downloaded successfully" };
  // }
}

/** The web app. */
export const app = new Routes();

/** The Express router. */
export const appRouter = getExpressRouter(app);
