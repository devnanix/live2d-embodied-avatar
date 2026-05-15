/**
 * AGENT STATE CONTROLLER
 */
import * as LAppDefine from './lappdefine';

interface DriftNode { p1: number; t1: number; p2: number; t2: number; }
interface BlendNode { from: number; to: number; startTime: number; duration: number; }

export class AgentStateControl {    
    public _currentState    = 'idle';
    private _unresolvedState    = 'idle';
    private _stateEnteredAt = performance.now();
    private _pendingState:  string | null = null;
    private _states: Record<string, any> = {};
    private _stateNames: string[] = [];

    // PARAMETER SNAPSHOT
    // Stores the "clean baseline" value for every param ever touched by a state.
    // Populated once on first touch via snapshotDefaults(), never overwritten.
    private _paramDefaults: Record<string, number> = {};

    // Tracks which param IDs the *current* state owns (Static + Drift).
    private _ownedParams: Set<string> = new Set();

    // Called once per frame BEFORE any state writes, so we can capture Live2D model defaults on the very first frame a param is seen.
    public snapshotDefaults(getParam: (id: string) => number): void {
        for (const stateName of Object.keys(this._states)) {
            const def = this._states[stateName];
            for (const s of def.Static ?? []) {
                if (!(s.Id in this._paramDefaults)) {
                    this._paramDefaults[s.Id] = getParam(s.Id);
                }
            }
            for (const d of def.Drift ?? []) {
                if (!(d.Id in this._paramDefaults)) {
                    this._paramDefaults[d.Id] = getParam(d.Id);
                }
            }
        }
    }

    // Returns all param IDs owned by a given state.
    private _stateParamIds(stateName: string): Set<string> {
        const ids = new Set<string>();
        if (!(stateName in this._states)) return ids;
        const def = this._states[stateName];
        for (const s of def.Static ?? []) ids.add(s.Id);
        for (const d of def.Drift  ?? []) ids.add(d.Id);
        return ids;
    }

    public async initialize(): Promise<void> {
        const folderPath = LAppDefine.ModelStatesPath;

        const manifestRes = await fetch(`${folderPath}manifest.json`, { cache: 'no-store' });
        if (!manifestRes.ok) throw new Error('Failed to fetch states manifest');

        const manifest = await manifestRes.json();
        const stateMap: Record<string, string> = manifest.states;

        const stateNames = Object.keys(stateMap);

        const requests = stateNames.map(async (name) => {
            const file = stateMap[name];
            const response = await fetch(`${folderPath}${file}`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`Failed to fetch state: ${name} (${file})`);
            this._states[name] = await response.json();
            return true;
        });

        await Promise.all(requests);
        this._stateNames = stateNames;
        console.log('[Agent] Loaded states:', this._stateNames);
    }

    public setCustomState(state: string): void {
        if(!Object.keys(this._stateNames).indexOf(this._currentState)){
            delete this._states[this._currentState];
        }
        const stateName = btoa(state);
        this._states[stateName] = JSON.parse(state);
        this._commitState(stateName);
    }
    
    public setAgentState(newState: string): void {
        if (newState === this._currentState && !this._pendingState) return;
        const elapsed    = performance.now() - this._stateEnteredAt;
        const minDisplay = this._states[this._currentState]?.MinimumTime ?? 0;
        if (elapsed >= minDisplay) {
            this._commitState(newState);
        } else {
            this._pendingState = newState;
        }
    }
    
    private _commitState(newState: string): void {
        this._unresolvedState = this._currentState;
        this._currentState    = newState;
        this._stateEnteredAt  = performance.now();
        this._pendingState    = null;
    }
    
    // DUAL SINE ORGANIC DRIFT
    
    private _drift: Record<string, DriftNode> = {};
    
    private smoothDrift(key: string, min: number, max: number, speed = 1.0): number {
        if (!this._drift[key]) {
            this._drift[key] = {
                p1: Math.random() * Math.PI * 2, t1: (3.5 + Math.random() * 2.0) / speed,
                p2: Math.random() * Math.PI * 2, t2: (7.1 + Math.random() * 3.0) / speed,
            };
        }
        const s = this._drift[key], t = performance.now() / 1000;
        const mid = (min + max) / 2, range = (max - min) / 2;
        return mid + (Math.sin(t / s.t1 + s.p1) * 0.6 + Math.sin(t / s.t2 + s.p2) * 0.4) * range;
    }
    
    // MOUTH STATE MACHINE
    
    private MOUTH_PARAMS = ['ParamA', 'ParamI', 'ParamU', 'ParamE', 'ParamO'];
    private _mouth = {
        active: null as string | null,
        value: 0, phase: 'rest' as string,
        phaseAt: 0, holdMs: 80, restMs: 80,
    };
    
    private updateMouth(setParam: (id: string, v: number) => void): void {
        const now = performance.now(), elapsed = now - this._mouth.phaseAt;
    
        if (this._currentState !== 'responding') {
            if (this._mouth.active !== null) {
                this.MOUTH_PARAMS.forEach(p => setParam(p, 0));
                this._mouth.active = null;
                this._mouth.phase  = 'rest';
            }
            return;
        }
    
        switch (this._mouth.phase) {
            case 'open':
                this._mouth.value = Math.min(1, elapsed / 80);
                setParam(this._mouth.active!, this._mouth.value);
                if (elapsed >= 80) { this._mouth.phase = 'hold'; this._mouth.phaseAt = now; }
                break;
            case 'hold':
                setParam(this._mouth.active!, 1);
                if (elapsed >= this._mouth.holdMs) { this._mouth.phase = 'close'; this._mouth.phaseAt = now; }
                break;
            case 'close':
                this._mouth.value = Math.max(0, 1 - elapsed / 80);
                setParam(this._mouth.active!, this._mouth.value);
                if (elapsed >= 80) {
                    setParam(this._mouth.active!, 0);
                    this._mouth.active  = null;
                    this._mouth.phase   = 'rest';
                    this._mouth.phaseAt = now;
                    this._mouth.restMs  = 40 + Math.random() * 120;
                }
                break;
            case 'rest':
                if (elapsed >= this._mouth.restMs) {
                    this._mouth.active  = this.MOUTH_PARAMS[Math.floor(Math.random() * this.MOUTH_PARAMS.length)];
                    this._mouth.phase   = 'open';
                    this._mouth.phaseAt = now;
                    this._mouth.holdMs  = 60 + Math.random() * 80;
                }
                break;
        }
    }
    
    // PARAMETER BLENDING
    private _blendParams: Record<string, BlendNode> = {};

    // LERP HELPER
    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * Math.max(0, Math.min(1, t));
    }

    // SMOOTHSTEP HELPER
    private smoothstep(t: number): number {
        t = Math.max(0, Math.min(1, t));
        return t * t * (3 - 2 * t);
    }

    // SAFE VALUE ACCESS
    private _liveValue(id: string, getParam: (id: string) => number): number {
        const v = getParam(id);
        return (v !== null && v !== undefined && !isNaN(v)) 
            ? v 
            : (this._paramDefaults[id] ?? 0);
    }

    private _resolveBlend(id: string, now: number): number {
        const b = this._blendParams[id];
        if (!b) return this._paramDefaults[id] ?? 0;
        const t = (now - b.startTime) / b.duration;
        return b.from + (b.to - b.from) * this.smoothstep(t);
    }

    // PARAMATER DRIVING    
    public driveParameters(
        getParam: (id: string) => number,
        setParam: (id: string, v: number) => void
    ): void {
        // Populate default snapshot on first frames
        this.snapshotDefaults(getParam);

        // Resolve pending transition
        if (this._pendingState) {
            if (performance.now() - this._stateEnteredAt >= (this._states[this._currentState]?.MinimumTime ?? 0)) {
                this.setAgentState(this._pendingState);
            }
        }
    
        // Max display timeout — move back to idle
        const maxDisplay = this._states[this._currentState]?.MaximumTime ?? 0;
        if (maxDisplay > 0 && !this._pendingState) {
            if (performance.now() - this._stateEnteredAt >= maxDisplay) {
                this.setAgentState('idle');
            }
        }
        
        // STATE TRANSITION (RESET ORPHANS, BLEND TO NEW PARAMETERS)
        if (this._unresolvedState !== this._currentState) {
            const prevState  = this._unresolvedState;
            const nextState  = this._currentState;
            const prevParams = this._stateParamIds(prevState);
            const nextParams = this._stateParamIds(nextState);

            const fadeOut = this._states[prevState]?.FadeOutTime ?? 200;
            const now     = performance.now();

            // Blend ophaned parameters back to default
            for (const id of prevParams) {
                if (!nextParams.has(id)) {
                    this._blendParams[id] = {
                        from:      this._liveValue(id, getParam),
                        to:        this._paramDefaults[id] ?? 0,
                        startTime: now,
                        duration:  fadeOut,
                    };
                }
            }

            // Blend static states
            const fadeIn = this._states[nextState]?.FadeInTime ?? 200;
            if (nextState in this._states) {
                for (const s of this._states[nextState].Static ?? []) {
                    this._blendParams[s.Id] = {
                        from:      this._liveValue(s.Id, getParam),
                        to:        s.Value,
                        startTime: now,
                        duration:  fadeIn,
                    };
                }
            }
            for (const d of this._states[nextState]?.Drift ?? []) {
                // Only register if not already handled as a static
                if (!this._blendParams[d.Id]) {
                    this._blendParams[d.Id] = {
                        from:      this._liveValue(d.Id, getParam),
                        to:        this.smoothDrift(nextState + d.Id, d.Min, d.Max, d.Time),
                        startTime: now,
                        duration:  fadeIn,
                    };
                }
            }

            this._ownedParams     = nextParams;
            this._unresolvedState = nextState;
        }

        // PER-FRAME: Resolve Blends
        const now = performance.now();
        for (const id of Object.keys(this._blendParams)) {
            const val = this._resolveBlend(id, now);
            setParam(id, val);

            // Clean up finished blends
            if (now >= this._blendParams[id].startTime + this._blendParams[id].duration) {
                delete this._blendParams[id];
            }
        }

        // PER-FRAME: Handle Drift
        if (this._currentState in this._states) {
            const drifts = this._states[this._currentState].Drift ?? [];
            for (const d of drifts) {
                const driftVal = this.smoothDrift(this._currentState + d.Id, d.Min, d.Max, d.Time);
                
                // If blending to a drift target, reset blend target each frame to ensure no snapping
                if (this._blendParams[d.Id]) {
                    // Update the target every frame to chase the moving drift value
                    this._blendParams[d.Id].to = driftVal;
                    // setParam will be handled by the blend resolution loop above
                } else {
                    setParam(d.Id, driftVal);
                }
            }
        }
        
        this.updateMouth(setParam);
    }
}