#include "NunheadHUD.h"
#include "NunheadGameMode.h"
#include "CamCharacter.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Kismet/GameplayStatics.h"

void ANunheadHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas || !GEngine) return;
	ANunheadGameMode* GM = Cast<ANunheadGameMode>(UGameplayStatics::GetGameMode(this));
	UFont* Big = GEngine->GetLargeFont(); UFont* Small = GEngine->GetMediumFont();
	const float W = Canvas->SizeX, H = Canvas->SizeY, S = FMath::Clamp(H / 1080.f, 0.7f, 2.f);   // scale with the viewport
	const FLinearColor Navy(0.06f, 0.11f, 0.30f, 0.88f), Gold(0.95f, 0.76f, 0.2f), White(1, 1, 1), Sky(0.36f, 0.66f, 0.96f), Red(0.86f, 0.16f, 0.16f);
	auto Centred = [&](const FString& T, const FLinearColor& C, float Y, UFont* F, float Scale) { float TW, TH; GetTextSize(T, TW, TH, F, Scale); DrawText(T, C, (W - TW) / 2, Y, F, Scale); return TH; };
	if (GM)
	{
		// scoreboard: team colour tabs either side of the score, the clock underneath
		const float PW = 420 * S, PH = 78 * S, PX = (W - PW) / 2, PY = 16 * S;
		DrawRect(Navy, PX, PY, PW, PH);
		DrawRect(Sky, PX, PY, 14 * S, PH); DrawRect(Red, PX + PW - 14 * S, PY, 14 * S, PH);
		Centred(FString::Printf(TEXT("BOSCO  %d - %d  ROVERS"), GM->ScoreHome, GM->ScoreAway), Gold, PY + 8 * S, Big, 1.5f * S);
		const int32 M = FMath::FloorToInt(GM->TimeLeft / 60.f), Sec = FMath::FloorToInt(GM->TimeLeft) % 60;
		const FString Clock = GM->bMatchOn ? FString::Printf(TEXT("%d:%02d"), M, Sec) : GM->bFullTime ? TEXT("FULL TIME") : TEXT("Touch the ball to kick off");
		Centred(Clock, GM->bMatchOn && GM->TimeLeft < 30.f ? Red : White, PY + 46 * S, Small, 1.1f * S);
		// the message banner, and a big flash while a goal is celebrated
		if (GM->CelebrateT > 0.f)
		{
			const float Pulse = 1.f + 0.12f * FMath::Sin(GM->CelebrateT * 9.f);
			Centred(GM->bLastGoalHome ? TEXT("GOAL!") : TEXT("ROVERS SCORE"), GM->bLastGoalHome ? Gold : Red, H * 0.3f, Big, 4.f * S * Pulse);
		}
		if (!GM->Message.IsEmpty()) { float TW, TH; GetTextSize(GM->Message, TW, TH, Big, 1.1f * S); DrawRect(FLinearColor(0, 0, 0, 0.6f), (W - TW) / 2 - 18 * S, H - 160 * S, TW + 36 * S, TH + 16 * S); Centred(GM->Message, Gold, H - 152 * S, Big, 1.1f * S); }
	}
	if (ACamCharacter* Cam = Cast<ACamCharacter>(GetOwningPawn()))
	{
		if (Cam->KickCharge > 0.f)
		{
			const float BW = 260 * S, BX = (W - BW) / 2, BY = H - 96 * S;
			DrawRect(FLinearColor(0, 0, 0, 0.55f), BX, BY, BW, 18 * S);
			DrawRect(FLinearColor::LerpUsingHSV(Gold, Red, Cam->KickCharge), BX + 2 * S, BY + 2 * S, (BW - 4 * S) * Cam->KickCharge, 14 * S);
			Centred(Cam->KickCharge > 0.95f ? TEXT("FULL POWER") : TEXT("charging..."), White, BY - 24 * S, Small, 0.9f * S);
		}
		const FString Hint = Cam->LastTouch.IsEmpty() ? TEXT("WASD move   Shift sprint   Space jump (into the ball to head it)   hold F / X to shoot, tap to pass, A/D curls   B calls the ball")
			: FString::Printf(TEXT("last touch: %s   |   hold F / X to shoot, tap to pass, B calls the ball, jump to head it"), *Cam->LastTouch);
		DrawText(Hint, FLinearColor(1, 1, 1, 0.7f), 16 * S, H - 34 * S, Small, 0.9f * S);
	}
}
