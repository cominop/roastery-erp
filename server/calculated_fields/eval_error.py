"""Evaluation error with context."""


class EvalError(Exception):
    """Error raised during expression evaluation with value context.

    Renders as #Error for Access-style compatibility.
    """

    def __init__(self, message: str, detail: str = "") -> None:
        self.message = message
        self.detail = detail
        super().__init__(self._format())

    def _format(self) -> str:
        if self.detail:
            return f"#Error: {self.message} ({self.detail})"
        return f"#Error: {self.message}"
