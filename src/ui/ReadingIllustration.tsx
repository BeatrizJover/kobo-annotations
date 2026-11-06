// Original artwork; fills and strokes come from the illustration tokens via app.css classes.
export function ReadingIllustration() {
  return (
    <svg class="illustration" viewBox="0 0 360 280" aria-hidden="true" focusable="false">
      <path
        class="ill-cream"
        d="M62 72C112 22 258 18 308 66C352 112 344 214 282 244C212 272 112 268 60 236C18 208 14 116 62 72Z"
      />

      <g class="ill-line">
        <path d="M70 108L52 98" />
        <circle cx="90" cy="114" r="19" />
        <circle cx="136" cy="110" r="19" />
        <path d="M109 112C113 104 117 103 117 109" />
        <path d="M155 106L172 94" />
      </g>

      <g class="ill-heart">
        <path
          class="ill-heart-accent"
          d="M206 102C195 94 190 85 197 79C202 75 207 78 207 83C208 78 213 75 218 79C224 85 218 94 206 102Z"
        />
        <path d="M238 128C230 122 227 116 231 112C234 109 238 111 238 114C239 111 243 109 246 112C250 116 246 122 238 128Z" />
      </g>

      <path
        class="ill-tint ill-edge"
        d="M56 158L54 240C90 232 125 234 150 246C175 234 210 232 246 240L244 158"
      />
      <path
        class="ill-paper ill-edge"
        d="M150 160C125 148 86 146 61 154L62 232C88 224 125 226 150 238Z"
      />
      <path
        class="ill-paper ill-edge"
        d="M150 160C175 148 214 146 239 154L238 232C212 224 175 226 150 238Z"
      />
      <g class="ill-text">
        <path d="M76 172C96 167 118 169 138 175" />
        <path d="M76 188C96 183 118 185 138 191" />
        <path d="M76 204C94 199 112 201 128 206" />
        <path d="M162 175C182 169 204 167 224 172" />
        <path d="M162 191C182 185 204 183 224 188" />
        <path d="M172 206C188 201 206 199 224 204" />
      </g>

      <path class="ill-line" d="M92 214C128 192 170 182 220 168" />
      <g class="ill-pink ill-edge">
        <path d="M118 200C120 186 134 180 140 184C138 194 128 200 118 200Z" />
        <path d="M128 196C124 208 130 218 138 220C140 210 136 202 128 196Z" />
        <path d="M156 188C160 174 174 170 180 174C176 184 166 190 156 188Z" />
        <path d="M168 184C166 196 172 206 180 206C182 196 176 188 168 184Z" />
        <path d="M200 175C206 163 218 162 222 166C216 174 208 177 200 175Z" />
      </g>

      <g class="ill-line">
        <path d="M268 166C260 154 276 146 268 132" />
        <path d="M282 164C274 150 292 142 284 124" />
        <path d="M296 166C288 154 304 146 296 134" />
      </g>
      <ellipse class="ill-tint ill-edge" cx="280" cy="236" rx="44" ry="9" />
      <path class="ill-line" d="M308 192C328 188 330 216 305 218" />
      <path class="ill-pink ill-edge" d="M250 182L256 226C258 236 302 236 304 226L310 182Z" />
      <ellipse class="ill-tint ill-edge" cx="280" cy="182" rx="30" ry="7" />
      <ellipse class="ill-ink" cx="280" cy="183" rx="23" ry="4" />
    </svg>
  );
}
