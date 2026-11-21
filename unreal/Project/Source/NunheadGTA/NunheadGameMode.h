#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "Goal.h"
#include "NunheadGameMode.generated.h"

class AFootball; class USoundBase; class UAudioComponent;

// Match flow: kick-off on the first touch, a 3 minute five-a-side on Nunhead Green, goals, near misses, goal kicks,
// celebrations, full time. The referee's whistle and the crowd (a loop, a roar, a groan) and Cam's mates' voices
// come from the sounds build_green.py imports; every path is optional.
UCLASS(Config=Game)
class NUNHEADGTA_API ANunheadGameMode : public AGameModeBase
{
	GENERATED_BODY()
public:
	ANunheadGameMode();
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Match") float MatchLength = 180.f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Match") float PitchHalfWidth = 1800.f;
	// testing aid: seconds after start to save a HighResShot to Saved/Screenshots (0 = never); set from the command line with
	// -ini:Game:[/Script/NunheadGTA.NunheadGameMode]:AutoScreenshotSeconds=20
	UPROPERTY(Config) float AutoScreenshotSeconds = 0.f;
	// the pitch frame comes from the two goals at BeginPlay: centre, the axis from the Bosco goal to the Rovers goal, half the distance
	UPROPERTY(BlueprintReadOnly, Category="Match") FVector PitchCentre = FVector::ZeroVector;
	UPROPERTY(BlueprintReadOnly, Category="Match") FVector PitchAxis = FVector::ForwardVector;
	UPROPERTY(BlueprintReadOnly, Category="Match") float PitchHalfLength = 2000.f;
	UPROPERTY(BlueprintReadOnly, Category="Match") int32 ScoreHome = 0;
	UPROPERTY(BlueprintReadOnly, Category="Match") int32 ScoreAway = 0;
	UPROPERTY(BlueprintReadOnly, Category="Match") float TimeLeft = 180.f;
	UPROPERTY(BlueprintReadOnly, Category="Match") bool bMatchOn = false;
	UPROPERTY(BlueprintReadOnly, Category="Match") bool bFullTime = false;
	UPROPERTY(BlueprintReadOnly, Category="Match") float CelebrateT = 0.f;
	UPROPERTY(BlueprintReadOnly, Category="Match") bool bLastGoalHome = true;
	UPROPERTY(BlueprintReadOnly, Category="Match") FString Message;
	UPROPERTY(BlueprintReadOnly, Category="Match") AFootball* Ball = nullptr;
	// sounds by path (DefaultGame.ini), all optional
	UPROPERTY(Config) FString CrowdLoopPath; UPROPERTY(Config) FString CrowdGoalPath; UPROPERTY(Config) FString CrowdGroanPath; UPROPERTY(Config) FString WhistlePath;
	UPROPERTY(Config) FString YayPath; UPROPERTY(Config) FString WoohooPath; UPROPERTY(Config) FString OohPath; UPROPERTY(Config) FString OhNoPath;
	UPROPERTY(Config) float CrowdVolume = 0.35f;
	// pushes the scalability groups to Epic (3) when the match starts, so Lumen, shadows and foliage run at full quality
	UPROPERTY(Config) bool bForceEpicScalability = true;

	UFUNCTION(BlueprintCallable, Category="Match") void StartMatch();
	UFUNCTION(BlueprintCallable, Category="Match") void EndMatch();
	void BallInGoal(AGoal* Goal, AFootball* InBall);
	void Feed(const FString& Text, float Seconds = 2.5f);
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
private:
	void Play2D(USoundBase* Sound, float Volume = 1.f);
	void ResetPlay();
	UPROPERTY() USoundBase* CrowdLoop = nullptr; UPROPERTY() USoundBase* CrowdGoal = nullptr; UPROPERTY() USoundBase* CrowdGroan = nullptr; UPROPERTY() USoundBase* Whistle = nullptr;
	UPROPERTY() USoundBase* Yay = nullptr; UPROPERTY() USoundBase* Woohoo = nullptr; UPROPERTY() USoundBase* Ooh = nullptr; UPROPERTY() USoundBase* OhNo = nullptr;
	UPROPERTY() UAudioComponent* CrowdAC = nullptr;
	float MessageT = 0.f;
	float ReplayLock = 0.f;
	float OutT = 0.f;
	bool bThrowIn = false; FVector ThrowInSpot = FVector::ZeroVector;   // a ball over the side restarts from where it went out
	float GroundZ = 0.f;   // the pitch surface under the ball's spawn, traced at start: the Green is not at Z = 0
	float Elapsed = 0.f; bool bShotTaken = false;
};
