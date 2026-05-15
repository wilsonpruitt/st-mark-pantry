import type { SignatureMethod } from '@/types'

export interface TefapDraft {
  eligibilityType: 'categorical' | 'income-attestation' | null
  categoricalPrograms: string[]
  residencyConfirmed: boolean
  signedByName: string
  signaturePng: string | null
  signatureMethod: SignatureMethod | null
  raceDeclined: boolean
  race: string[]
  ethnicity: 'hispanic' | 'not-hispanic' | 'declined' | null
}

export function emptyTefapDraft(): TefapDraft {
  return {
    eligibilityType: null,
    categoricalPrograms: [],
    residencyConfirmed: false,
    signedByName: '',
    signaturePng: null,
    signatureMethod: null,
    raceDeclined: false,
    race: [],
    ethnicity: null,
  }
}
