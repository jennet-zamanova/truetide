import { ObjectId } from "mongodb";

import { Router, getExpressRouter } from "./framework/router";

import { Authing, Citing, Labeling, Posting, Sessioning } from "./app";
import { PostOptions } from "./concepts/posting";
import { SessionDoc } from "./concepts/sessioning";
import Responses from "./responses";

import { z } from "zod";

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
   * @param content path to a video file
   * @param citations comma separated values
   * @param labels comma separated values
   * @param options
   * @returns
   */
  @Router.post("/posts")
  async createPost(session: SessionDoc, content: string, citations: string, labels: string, options?: PostOptions) {
    const user = Sessioning.getUser(session);
    const created = await Posting.create(user, content, options);
    // TODO: delete the video from us locally
    const _id = created.post?._id;
    if (_id !== undefined) {
      await Citing.addCitations(
        _id,
        citations.split(", ").map((citation) => new URL(citation)),
      );
      await Labeling.addLabelsForItem(_id, labels.split(", "));
    }
    return { msg: created.msg, post: await Responses.post(created.post) };
  }

  @Router.patch("/posts/:id")
  async updatePost(session: SessionDoc, id: string, content?: string, citations?: string[], labels?: string[], options?: PostOptions) {
    const user = Sessioning.getUser(session);
    const oid = new ObjectId(id);
    await Posting.assertAuthorIsUser(oid, user);
    if (citations) {
      await Citing.update(
        oid,
        citations.map((cite) => new URL(cite)),
      );
    }
    if (labels) {
      await Labeling.updateLabelsForItem(oid, labels);
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

  @Router.get("/api/posts/:postId/citations")
  async getCitations(postId: string) {
    const oid = new ObjectId(postId);
    const citations = (await Citing.getCitations(oid)).citations;
    return citations;
  }

  @Router.post("/api/posts/:postId/citations")
  async addCitations(session: SessionDoc, id: string, links: string[]) {
    const user = Sessioning.getUser(session);
    const oid = new ObjectId(id);
    await Posting.assertAuthorIsUser(oid, user);
    const urls = links.map((link: string) => new URL(link));
    return await Citing.addCitations(oid, urls);
  }

  @Router.get("/api/citations/:filepath/suggestions")
  // @Router.validate(z.object({ content: z.string() }))
  async getSuggestedCitationsContent(filePath: string) {
    const text = await Posting.getFileText(filePath);
    return await Citing.createCitationsGemini(text);
  }

  /**
   * Labeling routes
   */

  // get the "feed"
  @Router.get("/api/categories")
  async getAllCategories() {
    return await Labeling.getAllCategories();
  }

  // get opposing posts on a topic
  @Router.get("/api/posts/:category")
  async getPairedPostsOnTopic(category: string) {
    const allPosts = [];
    const postPairs = await Labeling.getOpposingItems(category);
    for (const postPair of postPairs) {
      const contents = await Responses.postsWithvideos(await Posting.getPostsSubset(postPair));
      const labels = await Promise.all(postPair.map((post) => Labeling.getLabelsForItem(post)));
      allPosts.push(
        contents.map((content, index) => {
          content: content;
          labels: labels[index];
        }),
      );
    }
    return allPosts;
  }

  // // add labels
  // @Router.post("/labels")
  // async addLabels(labels: String[]) {}

  // // get all labels
  // @Router.get("/labels")
  // async getLabels() {}

  // do not need friending concept

  // @Router.get("/friends")
  // async getFriends(session: SessionDoc) {
  //   const user = Sessioning.getUser(session);
  //   return await Authing.idsToUsernames(await Friending.getFriends(user));
  // }

  // @Router.delete("/friends/:friend")
  // async removeFriend(session: SessionDoc, friend: string) {
  //   const user = Sessioning.getUser(session);
  //   const friendOid = (await Authing.getUserByUsername(friend))._id;
  //   return await Friending.removeFriend(user, friendOid);
  // }

  // @Router.get("/friend/requests")
  // async getRequests(session: SessionDoc) {
  //   const user = Sessioning.getUser(session);
  //   return await Responses.friendRequests(await Friending.getRequests(user));
  // }

  // @Router.post("/friend/requests/:to")
  // async sendFriendRequest(session: SessionDoc, to: string) {
  //   const user = Sessioning.getUser(session);
  //   const toOid = (await Authing.getUserByUsername(to))._id;
  //   return await Friending.sendRequest(user, toOid);
  // }

  // @Router.delete("/friend/requests/:to")
  // async removeFriendRequest(session: SessionDoc, to: string) {
  //   const user = Sessioning.getUser(session);
  //   const toOid = (await Authing.getUserByUsername(to))._id;
  //   return await Friending.removeRequest(user, toOid);
  // }

  // @Router.put("/friend/accept/:from")
  // async acceptFriendRequest(session: SessionDoc, from: string) {
  //   const user = Sessioning.getUser(session);
  //   const fromOid = (await Authing.getUserByUsername(from))._id;
  //   return await Friending.acceptRequest(fromOid, user);
  // }

  // @Router.put("/friend/reject/:from")
  // async rejectFriendRequest(session: SessionDoc, from: string) {
  //   const user = Sessioning.getUser(session);
  //   const fromOid = (await Authing.getUserByUsername(from))._id;
  //   return await Friending.rejectRequest(fromOid, user);
  // }

  // get all labels associated with topic
  // @Router.get("/labels/:topic")
  // async getTagsOnTopic(topic: String) {
  //   // let posts: PostDoc[] = [];
  //   // const controversialRating: Number = await DualViewing.getRating(topic);
  //   // const TRESHOLD: Number = 0.7;
  //   // if (controversialRating > TRESHOLD) {
  //   //   const controversialContent = await DualViewing.getOpposingItems(topic);
  //   //   const contentPosts = await Posting.getPostsSubset(controversialContent);
  //   //   posts.concat(contentPosts);
  //   // } else {
  //   //   const labels = await DualViewing.getTagsForTopic(topic);
  //   //   for (const label of labels) {
  //   //     const contents = await Labeling.getItemsWithTag(label);
  //   //     const contentPosts = await Posting.getPostsSubset(contents);
  //   //     posts.concat(contentPosts);
  //   //   }
  //   // }
  //   // select randomly keys
  //   // select randomly corresponding opposing items
  // }
}

/** The web app. */
export const app = new Routes();

/** The Express router. */
export const appRouter = getExpressRouter(app);
