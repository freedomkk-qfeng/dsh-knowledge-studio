import {Service} from '@deepseek-ai/cordis'
import {createMediaProviders} from './providers.js'
import {apply as installOfficeTools} from './office-tools.js'
import {installMediaTools} from './media-tools.js'
import {loadMusicCatalog} from './music.js'
import {installArtifactSkills} from './skills.js'

export const name='dsh-artifact-services'
export class ArtifactServices extends Service {
  static inject=['tools','fs','permissionPresets','skills']
  constructor(ctx,config={}) {
    super(ctx,'artifactServices')
    this.media=createMediaProviders()
    this.speech=this.media.speechService
    this.ready=loadMusicCatalog(this.media,config.bgmRoot)
    installOfficeTools(ctx)
    installMediaTools(ctx,this)
    if(config.skills!==false) {
      const dispose=installArtifactSkills(ctx)
      ctx.effect(()=>dispose,'dsh-artifact-services: skills')
    }
  }
  registerSpeechProvider(provider) {return this.media.registerSpeech(provider)}
  registerBackgroundMusic(track) {return this.media.registerMusic(track)}
}
export default ArtifactServices
