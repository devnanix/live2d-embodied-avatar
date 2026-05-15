"use strict";
const fs = require('fs');
const publicResources = [
  {src: './Core', dst: './dist/Core'},
  {src: './Framework/Shaders', dst: './dist/Framework/Shaders'},
  {src: './models', dst: './dist/models'}
];

publicResources.forEach((e)=>{if (fs.existsSync(e.dst)) fs.rmSync(e.dst, { recursive: true })});
publicResources.forEach((e)=>fs.cpSync(e.src, e.dst, {recursive: true}));
