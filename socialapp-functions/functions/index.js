const functions = require('firebase-functions');
const express = require('express');
const app = express();
const FBAuth = require('./util/fbAuth')
const { db } = require('./util/admin')
const { getAllPosts, postOnePost, getPost, commentOnPost, likePost, unlikePost, deletePost} = require('./handlers/posts')
const {signUp, login, uploadImage, addUserDetails, getAuthenticatedUser, getUserDetails, markNotificationsRead} = require('./handlers/users')

// DB

//Posts routes
app.get('/posts', getAllPosts )
app.post('/post', FBAuth, postOnePost);
app.get('/user', FBAuth, getAuthenticatedUser)
app.get('/post/:postId', getPost);
app.post('/post/:postId/comment', FBAuth , commentOnPost )
app.get('/post/:postId/like', FBAuth, likePost);
app.get('/post/:postId/unlike', FBAuth, unlikePost);
app.delete('/post/:postId', FBAuth, deletePost)
//User routes
app.post('/signup', signUp);
app.post('/login', login);
app.post('/user/image', FBAuth, uploadImage);
app.post('/user', FBAuth, addUserDetails);
app.get('/user/:handle', getUserDetails);
app.post('/notifications',FBAuth, markNotificationsRead)

exports.api = functions.https.onRequest(app);

exports.createNotificationOnLike = functions.firestore.document('likes/{id}')
  .onCreate((snapshot) => {
      return db.doc(`/posts/${snapshot.data().postId}`).get()
      .then( doc => {
          if(doc.exists && doc.data().handleUser !== snapshot.data().handleUser){
              return db.doc(`/notifications/${snapshot.id}`)
              .set({
                  createdAt: new Date().toISOString(),
                  recipient: doc.data().handleUser,
                  sender: snapshot.data().handleUser,
                  type: 'like',
                  read: false,
                  postId: doc.id
              })
          }
      })
      .catch(err=>{
          console.error(err);
      });
  });

exports.deleteNotificationOnUnlike = functions.firestore.document('likes/{id}')
   .onDelete((snapshot) => {
      return db.doc(`/notifications/${snapshot.id}`)
         .delete()
         .catch(err=>{
             console.error(err)
             return;
         });
   });

exports.createNotificationOnComment = functions.firestore.document('comments/{id}')
    .onCreate((snapshot) => {
        return db.doc(`/posts/${snapshot.data().postId}`).get()
        .then( (doc) => {
            if(doc.exists && doc.data().handleUser !== snapshot.data().handleUser){
                return db.doc(`/notifications/${snapshot.id}`)
                .set({
                    createdAt: new Date().toISOString(),
                    recipient: doc.data().handleUser,
                    sender: snapshot.data().handleUser,
                    type: 'comment',
                    read: false,
                    postId: doc.id
                })
            }
        })
        .catch(err=>{
            console.error(err);
            return
        });
    });


    exports.onUserImageChange = functions.firestore.document('/users/{userId}')
     .onUpdate((change) => {
         if(change.before.data().imageUrl !== change.after.data().imageUrl){
            const batch = db.batch();
            return db.collection('posts')
            .where('handleUser', '==', change.before.data().handle).get()
            .then(data=>{
                data.forEach(doc => {
                    const post = db.doc(`/posts/${doc.id}`);
                    batch.update(post, {userImage: change.after.data().imageUrl })
                })
                return batch.commit()
            })
         } else return true;
     });

     exports.onPostDelete = functions.firestore.document('/posts/{postId}')
     .onDelete((snapshot, context)=>{
         const postId = context.params.postId;
         const batch = db.batch();
         return db.collection('comments')
         .where('postId', '==', postId).get()
         .then(data => {
             data.forEach(doc => {
                 batch.delete(db.doc(`/comments/${doc.id}`))
             })
             return db.collection('likes')
             .where('postId', '==', postId).get()
         })
         .then(data => {
            data.forEach(doc => {
                batch.delete(db.doc(`/likes/${doc.id}`))
            })
            return db.collection('notifications')
            .where('postId', '==', postId).get()
        })
         .then(data => {
            data.forEach(doc => {
                batch.delete(db.doc(`/notifications/${doc.id}`))
            })
            return batch.commit();
        })
        .catch(err => console.error(err));
     })