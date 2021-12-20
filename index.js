import express           from 'express';
import ApiClient         from 'Emby.ApiClient.Javascript';
import ConnectionManager from 
        'Emby.ApiClient.Javascript/connectionmanager.js';

const connMgr = new ConnectionManager();

const api = new ApiClient(
  
);

const app = new express();

app.get('/', function (req, res) {
  res.send('hello world')
})

app.listen(8734, () => {
  console.log('server listening on port 8734');
})